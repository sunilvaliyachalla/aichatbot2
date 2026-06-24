import { describe, it, expect } from "vitest";
import {
  createAnswerSignal,
  createCandidateSignal,
  createOfferSignal,
  isValidRoomId,
  shouldInitiate,
  toIceCandidateInit,
} from "./protocol";

describe("isValidRoomId", () => {
  it("accepts a non-empty string", () => {
    expect(isValidRoomId("room-1")).toBe(true);
  });

  it("rejects empty / whitespace / non-strings", () => {
    expect(isValidRoomId("")).toBe(false);
    expect(isValidRoomId("   ")).toBe(false);
    expect(isValidRoomId(123)).toBe(false);
    expect(isValidRoomId(null)).toBe(false);
    expect(isValidRoomId(undefined)).toBe(false);
  });

  it("rejects ids longer than 128 chars", () => {
    expect(isValidRoomId("a".repeat(129))).toBe(false);
    expect(isValidRoomId("a".repeat(128))).toBe(true);
  });
});

describe("shouldInitiate", () => {
  it("initiates when peers already exist (newcomer offers)", () => {
    expect(shouldInitiate(["peer-1"])).toBe(true);
  });

  it("waits when alone in the room", () => {
    expect(shouldInitiate([])).toBe(false);
  });
});

describe("signal constructors", () => {
  it("builds offer and answer signals", () => {
    expect(createOfferSignal("sdp-1")).toEqual({ kind: "offer", sdp: "sdp-1" });
    expect(createAnswerSignal("sdp-2")).toEqual({ kind: "answer", sdp: "sdp-2" });
  });

  it("builds a candidate signal from an RTCIceCandidate", () => {
    const candidate = {
      candidate: "candidate:1 1 udp ...",
      sdpMid: "0",
      sdpMLineIndex: 0,
    } as RTCIceCandidate;

    expect(createCandidateSignal(candidate)).toEqual({
      kind: "candidate",
      candidate: "candidate:1 1 udp ...",
      sdpMid: "0",
      sdpMLineIndex: 0,
    });
  });

  it("round-trips a candidate back to RTCIceCandidateInit", () => {
    const init = toIceCandidateInit({
      kind: "candidate",
      candidate: "cand",
      sdpMid: null,
      sdpMLineIndex: null,
    });
    expect(init).toEqual({
      candidate: "cand",
      sdpMid: undefined,
      sdpMLineIndex: undefined,
    });
  });
});
