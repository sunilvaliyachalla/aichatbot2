import { describe, it, expect } from "vitest";
import { downsampleToPcm16 } from "./AudioCaptioner";

describe("downsampleToPcm16 (unit)", () => {
  it("halves the sample count for 2:1 downsampling", () => {
    const input = new Float32Array(48000); // 1s @ 48k
    const out = new Int16Array(downsampleToPcm16(input, 48000, 16000));
    // 48k -> 16k is 3:1, so ~16000 samples.
    expect(out.length).toBe(16000);
  });

  it("converts Float32 [-1,1] to full-scale Int16", () => {
    const input = new Float32Array([1, -1, 0]);
    const out = new Int16Array(downsampleToPcm16(input, 16000, 16000));
    expect(out[0]).toBe(32767); // +1 -> max
    expect(out[1]).toBe(-32768); // -1 -> min
    expect(out[2]).toBe(0);
  });

  it("clamps out-of-range samples", () => {
    const input = new Float32Array([2, -2]);
    const out = new Int16Array(downsampleToPcm16(input, 16000, 16000));
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
  });

  it("averages the window (anti-alias) rather than picking one sample", () => {
    // Two input samples per output sample; output should be their mean.
    const input = new Float32Array([1, 0, 1, 0]); // -> 2 outputs, each mean 0.5
    const out = new Int16Array(downsampleToPcm16(input, 32000, 16000));
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0.5 * 32767, -1);
    expect(out[1]).toBeCloseTo(0.5 * 32767, -1);
  });
});
