import { CaptionClient } from "./CaptionClient";

/**
 * Captures microphone audio in the browser and streams it as 16 kHz mono PCM16
 * to a [CaptionClient], flushing every `flushIntervalMs` for incremental
 * captions. Mirrors the Android AudioCaptioner, but taps the existing call
 * MediaStream (no second mic) via the Web Audio API.
 *
 * Uses ScriptProcessorNode: deprecated but universally supported (incl. mobile
 * Safari/Chrome) and adequate for low-rate speech capture.
 */
export class AudioCaptioner {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly stream: MediaStream,
    private readonly client: CaptionClient,
    private readonly flushIntervalMs = 3000
  ) {}

  async start(): Promise<void> {
    this.client.connect();

    const ctx = new AudioContext();
    // Autoplay policies can leave the context suspended until a gesture.
    if (ctx.state === "suspended") await ctx.resume();
    this.ctx = ctx;

    const source = ctx.createMediaStreamSource(this.stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    // Route through a zero-gain node so the tap runs without echoing the mic
    // back to the speakers (ScriptProcessor must reach a destination to fire).
    const mute = ctx.createGain();
    mute.gain.value = 0;

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      this.client.sendPcm(downsampleToPcm16(input, ctx.sampleRate, 16000));
    };

    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);

    this.source = source;
    this.processor = processor;
    this.mute = mute;

    this.flushTimer = setInterval(() => this.client.flush(), this.flushIntervalMs);
  }

  stop(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mute?.disconnect();
    if (this.processor) this.processor.onaudioprocess = null;
    void this.ctx?.close();
    this.processor = null;
    this.source = null;
    this.mute = null;
    this.ctx = null;
    this.client.close();
  }
}

/**
 * Downsample Float32 samples at `inRate` to Int16 PCM at `outRate`, averaging
 * each output window (a cheap low-pass) instead of picking one sample. This
 * avoids the aliasing that nearest-sample decimation introduces, which noticeably
 * improves ASR accuracy. Returns a fresh ArrayBuffer to send.
 */
export function downsampleToPcm16(
  input: Float32Array,
  inRate: number,
  outRate: number
): ArrayBuffer {
  if (inRate === outRate) return floatToPcm16(input);
  const ratio = inRate / outRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const avg = end > start ? sum / (end - start) : input[start] ?? 0;
    const s = Math.max(-1, Math.min(1, avg));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

function floatToPcm16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}
