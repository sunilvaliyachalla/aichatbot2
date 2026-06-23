import type { SignalData } from "../types";

/**
 * Pure helpers for the signaling protocol and 1:1 negotiation rules. No DOM /
 * socket dependencies so they can be unit-tested directly.
 */

/** Mirrors the server's room id validation. */
export function isValidRoomId(roomId: unknown): roomId is string {
  return (
    typeof roomId === "string" &&
    roomId.trim().length > 0 &&
    roomId.length <= 128
  );
}

/**
 * Glare-free rule: the newcomer (who learns of existing peers via the join ack)
 * initiates the offer. An empty peer list means we wait for someone to join.
 */
export function shouldInitiate(existingPeers: readonly string[]): boolean {
  return existingPeers.length > 0;
}

export function createOfferSignal(sdp: string): SignalData {
  return { kind: "offer", sdp };
}

export function createAnswerSignal(sdp: string): SignalData {
  return { kind: "answer", sdp };
}

export function createCandidateSignal(candidate: RTCIceCandidate): SignalData {
  return {
    kind: "candidate",
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
  };
}

/** Convert a received candidate signal into RTCIceCandidateInit form. */
export function toIceCandidateInit(
  data: Extract<SignalData, { kind: "candidate" }>
): RTCIceCandidateInit {
  return {
    candidate: data.candidate,
    sdpMid: data.sdpMid ?? undefined,
    sdpMLineIndex: data.sdpMLineIndex ?? undefined,
  };
}
