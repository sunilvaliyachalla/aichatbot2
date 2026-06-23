import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { SignalingClient } from "../signaling/SignalingClient";
import { PeerConnection } from "../webrtc/PeerConnection";
import { shouldInitiate } from "../lib/protocol";
import type { CallState, SignalData } from "../types";

const INITIAL_STATE: CallState = {
  status: "idle",
  roomId: null,
  error: null,
  micEnabled: true,
  cameraEnabled: true,
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

  // Refs hold the live instances so handlers always see current values.
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<PeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);
  const isInitiatorRef = useRef(false);

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
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
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

  /** Centralized teardown: peer connection, tracks, and socket. */
  const cleanup = useCallback(() => {
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
  }, [state.roomId]);

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
  };
}
