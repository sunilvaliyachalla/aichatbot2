import type { SignalData } from "../types";
import {
  createAnswerSignal,
  createCandidateSignal,
  createOfferSignal,
  toIceCandidateInit,
} from "../lib/protocol";

export interface PeerConnectionHandlers {
  /** Emit a signaling message that must be relayed to the remote peer. */
  onSignal: (data: SignalData) => void;
  /** A remote media stream became available. */
  onRemoteStream: (stream: MediaStream) => void;
  /** Connection state changed (driven by RTCPeerConnection). */
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}

/**
 * WebRTC peer connection layer for a single remote peer. Encapsulates the
 * RTCPeerConnection, perfect-negotiation-friendly offer/answer handling, ICE
 * candidate exchange and cleanup. Media flows directly peer-to-peer; this class
 * never touches the signaling transport (it emits via onSignal).
 */
export class PeerConnection {
  private readonly pc: RTCPeerConnection;
  private readonly remoteStream = new MediaStream();

  /**
   * @param isInitiator The newcomer in the room creates the offer. This maps
   *   to the "polite/impolite" roles: initiator is impolite, the existing peer
   *   is polite (it yields on glare).
   */
  constructor(
    iceServers: RTCIceServer[],
    private readonly isInitiator: boolean,
    private readonly handlers: PeerConnectionHandlers
  ) {
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.handlers.onSignal(createCandidateSignal(candidate));
      }
    };

    this.pc.ontrack = (event) => {
      // Add tracks to a single, stable remote stream so the <video> element
      // keeps the same srcObject across renegotiations.
      this.remoteStream.addTrack(event.track);
      this.handlers.onRemoteStream(this.remoteStream);
    };

    this.pc.onconnectionstatechange = () => {
      this.handlers.onConnectionStateChange(this.pc.connectionState);
    };

    // Renegotiation entry point. Only the initiator proactively creates offers
    // to avoid both sides offering simultaneously in the common 1:1 case.
    this.pc.onnegotiationneeded = async () => {
      if (!this.isInitiator) return;
      try {
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          this.handlers.onSignal(createOfferSignal(this.pc.localDescription.sdp));
        }
      } catch (err) {
        console.error("negotiationneeded failed", err);
      }
    };
  }

  /** Attach local tracks. Triggers negotiationneeded for the initiator. */
  addLocalStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream);
    }
  }

  /** Handle an incoming signaling message routed from the remote peer. */
  async handleSignal(data: SignalData): Promise<void> {
    try {
      if (data.kind === "offer") {
        await this.pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          this.handlers.onSignal(createAnswerSignal(this.pc.localDescription.sdp));
        }
      } else if (data.kind === "answer") {
        // Ignore stray answers when we aren't expecting one.
        if (this.pc.signalingState === "have-local-offer") {
          await this.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        }
      } else if (data.kind === "candidate") {
        await this.pc.addIceCandidate(toIceCandidateInit(data));
      }
    } catch (err) {
      console.error("handleSignal failed", err);
    }
  }

  get connectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  /** Close the connection and release all senders/receivers. */
  close(): void {
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.onnegotiationneeded = null;
    this.pc.getSenders().forEach((s) => s.track?.stop());
    this.remoteStream.getTracks().forEach((t) => this.remoteStream.removeTrack(t));
    this.pc.close();
  }
}
