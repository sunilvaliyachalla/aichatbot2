import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CaptionClient } from "./CaptionClient";

/** Minimal fake WebSocket that records sends and lets tests drive events. */
class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.OPEN;
  binaryType = "";
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  emitMessage(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
});
afterEach(() => vi.restoreAllMocks());

describe("CaptionClient (unit)", () => {
  it("surfaces final captions with an optional translation", () => {
    const onCaption = vi.fn();
    const client = new CaptionClient("ws://x/ws/transcribe", onCaption);
    client.connect();
    const ws = FakeWebSocket.instances[0];

    ws.emitMessage({ type: "final", text: "hello world", translation: "hola mundo" });
    expect(onCaption).toHaveBeenCalledWith("hello world", "hola mundo");

    ws.emitMessage({ type: "final", text: "no translation" });
    expect(onCaption).toHaveBeenLastCalledWith("no translation", null);
  });

  it("ignores blank captions and malformed frames", () => {
    const onCaption = vi.fn();
    const client = new CaptionClient("ws://x", onCaption);
    client.connect();
    const ws = FakeWebSocket.instances[0];

    ws.emitMessage({ type: "final", text: "   " });
    ws.onmessage?.({ data: "not json" });
    expect(onCaption).not.toHaveBeenCalled();
  });

  it("reports server errors via onError", () => {
    const onError = vi.fn();
    const client = new CaptionClient("ws://x", vi.fn(), onError);
    client.connect();
    FakeWebSocket.instances[0].emitMessage({ type: "error", detail: "boom" });
    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("sends lang commands and a queued language on open", () => {
    const client = new CaptionClient("ws://x", vi.fn());
    client.setLanguage("Spanish"); // before connect -> queued
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    expect(ws.sent).toContain("lang:Spanish");

    client.setLanguage(null); // off
    expect(ws.sent).toContain("lang:off");
  });

  it("flush and close send the right control frames", () => {
    const client = new CaptionClient("ws://x", vi.fn());
    client.connect();
    const ws = FakeWebSocket.instances[0];
    client.flush();
    expect(ws.sent).toContain("flush");
    client.close();
    expect(ws.sent).toContain("close");
    expect(ws.closed).toBe(true);
  });
});
