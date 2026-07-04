import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { SignalingClient } from "../signaling/SignalingClient";
import { PeerConnection } from "../webrtc/PeerConnection";
import { shouldInitiate } from "../lib/protocol";
import { CaptionClient } from "../ai/CaptionClient";
import { AudioCaptioner } from "../ai/AudioCaptioner";
import { summarize as summarizeApi, ask as askApi } from "../ai/AiClient";
import type { CallState, SignalData } from "../types";

/** Live-translation targets cycled by the language button (null = off). */
const CAPTION_LANGUAGES: (string | null)[] = [null, "Spanish", "French", "Hindi"];

const INITIAL_STATE: CallState = {
  status: "idle",
  roomId: null,
  error: null,
  micEnabled: true,
  cameraEnabled: true,
  aiAvailable: config.ai.enabled,
  captionsEnabled: false,
  caption: "",
  captionTranslation: "",
  captionLanguage: null,
  summarizing: false,
  summary: null,
  actionItems: [],
  asking: false,
  answer: null,
};

/**
 * Room/session state management layer. Wires the signaling client to the
 * WebRTC peer connection for a 1:1 call and exposes a clean API + media
 * streams to the UI. All teardown (tracks, peer connection, socket) is
 * centralized in cleanup().
 */
export function useCall() {
  const [state, setState] = useState<CallState>(INITIAL_STATE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Mirror of the latest state so event/interval callbacks avoid stale closures.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Refs hold the live instances so handlers always see current values.
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<PeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);
  const isInitiatorRef = useRef(false);

  // AI captions/summary
  const captionerRef = useRef<AudioCaptioner | null>(null);
  const captionClientRef = useRef<CaptionClient | null>(null);
  const transcriptRef = useRef<string[]>([]);

  const patch = useCallback((p: Partial<CallState>) => {
    setState((prev) => ({ ...prev, ...p }));
  }, []);

  /** Create (or recreate) the peer connection toward the remote peer. */
  const createPeer = useCallback((peerId: string, isInitiator: boolean) => {
    peerRef.current?.close();
    remotePeerIdRef.current = peerId;
    isInitiatorRef.current = isInitiator;

    const peer = new PeerConnection(config.iceServers, isInitiator, {
      onSignal: (data: SignalData) => {
        signalingRef.current?.sendSignal(peerId, data);
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
        patch({ status: "connected" });
      },
      onConnectionStateChange: (cs) => {
        if (cs === "connected") patch({ status: "connected" });
        else if (cs === "disconnected" || cs === "failed") {
          patch({ status: "reconnecting" });
        }
      },
    });

    if (localStreamRef.current) peer.addLocalStream(localStreamRef.current);
    peerRef.current = peer;
    return peer;
  }, [patch]);

  /** Acquire camera + microphone. Surfaces permission errors to the UI. */
  const getLocalMedia = useCallback(async (): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      // 360p @ 24fps keeps encode/decode light on phones and modest Wi-Fi,
      // which is the usual cause of lag on a 1:1 call. Bump these for desktops
      // on a strong network. Outbound bitrate is also capped in PeerConnection.
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 24, max: 30 },
      },
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const join = useCallback(
    async (roomId: string) => {
      const trimmed = roomId.trim();
      if (!trimmed) {
        patch({ status: "error", error: "Please enter a room ID." });
        return;
      }

      try {
        patch({ status: "connecting", error: null, roomId: trimmed });
        await getLocalMedia();

        const signaling = new SignalingClient(config.signalingUrl, {
          onConnect: () => {},
          onDisconnect: () => patch({ status: "reconnecting" }),
          onReconnect: async () => {
            // Re-join the room after a transport reconnect and rebuild the peer.
            try {
              const ack = await signalingRef.current!.joinRoom(trimmed);
              if (ack.ok && shouldInitiate(ack.peers)) {
                const peer = createPeer(ack.peers[0], true);
                if (localStreamRef.current) peer.addLocalStream(localStreamRef.current);
              } else {
                patch({ status: "waiting" });
              }
            } catch {
              /* socket.io will keep retrying */
            }
          },
          onPeerJoined: (peerId) => {
            // We were waiting; the newcomer will send us an offer (it is the
            // initiator). We act as the non-initiator and answer.
            createPeer(peerId, false);
          },
          onPeerLeft: (peerId) => {
            if (remotePeerIdRef.current === peerId) {
              peerRef.current?.close();
              peerRef.current = null;
              remotePeerIdRef.current = null;
              setRemoteStream(null);
              patch({ status: "waiting" });
            }
          },
          onSignal: (from, data) => {
            if (!peerRef.current || remotePeerIdRef.current !== from) {
              // First contact from a peer (e.g. their offer): we answer.
              createPeer(from, false);
            }
            void peerRef.current?.handleSignal(data);
          },
        });

        signalingRef.current = signaling;
        signaling.connect();

        const ack = await signaling.joinRoom(trimmed);
        if (!ack.ok) {
          patch({
            status: "error",
            error:
              ack.reason === "room-full"
                ? "Room is full (1:1 only)."
                : "Invalid room ID.",
          });
          cleanup();
          return;
        }

        if (shouldInitiate(ack.peers)) {
          // Someone is already here -> we are the initiator and create the offer.
          createPeer(ack.peers[0], true);
        } else {
          patch({ status: "waiting" });
        }
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera/microphone permission denied."
            : err instanceof Error
            ? err.message
            : "Failed to join call.";
        patch({ status: "error", error: message });
        cleanup();
      }
    },
    [createPeer, getLocalMedia, patch]
  );

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    patch({ micEnabled: track.enabled });
  }, [patch]);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    patch({ cameraEnabled: track.enabled });
  }, [patch]);

  /** Stop live captions and release the audio tap. Safe to call when off. */
  const stopCaptions = useCallback(() => {
    captionerRef.current?.stop();
    captionerRef.current = null;
    captionClientRef.current = null;
  }, []);

  /**
   * Toggle live AI captions. Taps the existing mic stream, streams PCM to the
   * ai-server, and accumulates a transcript for summary/Q&A. Opt-in by design.
   */
  const toggleCaptions = useCallback(async () => {
    if (!config.ai.enabled) return;
    if (captionerRef.current) {
      stopCaptions();
      patch({ captionsEnabled: false, caption: "", captionTranslation: "" });
      return;
    }
    const stream = localStreamRef.current;
    if (!stream) return;

    const client = new CaptionClient(
      config.ai.captionsWsUrl,
      (line, translation) => {
        transcriptRef.current.push(line);
        patch({ caption: line, captionTranslation: translation ?? "" });
      },
      (msg) => console.warn("captions:", msg)
    );
    captionClientRef.current = client;
    const captioner = new AudioCaptioner(stream, client);
    captionerRef.current = captioner;

    try {
      await captioner.start();
      client.setLanguage(stateRef.current.captionLanguage); // re-apply chosen language
      patch({ captionsEnabled: true });
    } catch (err) {
      stopCaptions();
      patch({
        error: err instanceof Error ? err.message : "Could not start captions.",
      });
    }
  }, [patch, stopCaptions]);

  /** Cycle live-translation target: Off → Spanish → French → Hindi → Off. */
  const cycleCaptionLanguage = useCallback(() => {
    if (!config.ai.enabled) return;
    const current = CAPTION_LANGUAGES.indexOf(stateRef.current.captionLanguage);
    const next = CAPTION_LANGUAGES[(current + 1) % CAPTION_LANGUAGES.length];
    captionClientRef.current?.setLanguage(next);
    patch({ captionLanguage: next, captionTranslation: "" });
  }, [patch]);

  /** Summarize the accumulated transcript via the ai-server (Ollama). */
  const requestSummary = useCallback(async () => {
    if (!config.ai.enabled) return;
    const transcript = transcriptRef.current.join("\n");
    if (!transcript.trim()) {
      patch({ error: "Turn on captions and speak first — nothing to summarize yet." });
      return;
    }
    patch({ summarizing: true, error: null });
    try {
      const result = await summarizeApi(config.ai.summaryUrl, transcript);
      patch({
        summarizing: false,
        summary: result.summary,
        actionItems: result.actionItems,
      });
    } catch (err) {
      patch({
        summarizing: false,
        error: `Summary failed: ${err instanceof Error ? err.message : err}`,
      });
    }
  }, [patch]);

  const dismissSummary = useCallback(
    () => patch({ summary: null, actionItems: [] }),
    [patch]
  );

  /** Ask a question grounded in the live transcript (ai-server /ask). */
  const askQuestion = useCallback(
    async (question: string) => {
      if (!config.ai.enabled || !question.trim()) return;
      const transcript = transcriptRef.current.join("\n");
      if (!transcript.trim()) {
        patch({ error: "No conversation captured yet — turn on captions first." });
        return;
      }
      patch({ asking: true, error: null });
      try {
        const answer = await askApi(config.ai.askUrl, transcript, question);
        patch({ asking: false, answer });
      } catch (err) {
        patch({
          asking: false,
          error: `Ask failed: ${err instanceof Error ? err.message : err}`,
        });
      }
    },
    [patch]
  );

  const dismissAnswer = useCallback(() => patch({ answer: null }), [patch]);

  /** Centralized teardown: peer connection, tracks, socket, and captions. */
  const cleanup = useCallback(() => {
    stopCaptions();
    transcriptRef.current = [];

    peerRef.current?.close();
    peerRef.current = null;

    if (state.roomId) signalingRef.current?.leaveRoom(state.roomId);
    signalingRef.current?.disconnect();
    signalingRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remotePeerIdRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
  }, [state.roomId, stopCaptions]);

  const hangup = useCallback(() => {
    cleanup();
    setState({ ...INITIAL_STATE, status: "ended" });
  }, [cleanup]);

  // Cleanup on unmount.
  useEffect(() => cleanup, [cleanup]);

  return {
    state,
    localStream,
    remoteStream,
    join,
    hangup,
    toggleMic,
    toggleCamera,
    // AI features (no-ops unless the ai-server is configured).
    toggleCaptions,
    cycleCaptionLanguage,
    requestSummary,
    dismissSummary,
    ask: askQuestion,
    dismissAnswer,
  };
}
