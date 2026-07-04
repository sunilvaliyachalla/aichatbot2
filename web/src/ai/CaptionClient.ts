/**
 * WebSocket client for live captions. Streams raw PCM16 @ 16 kHz to the FastAPI
 * ai-server (`/ws/transcribe`) and surfaces transcribed text (+ optional
 * translation). Mirrors the Android AiCaptionClient. Pure transport — audio
 * capture lives in AudioCaptioner.
 *
 * Protocol: send binary PCM16 chunks; text "flush" to transcribe the buffer;
 * "lang:<name>" to translate, "lang:off" to stop; "close" to end. The server
 * replies with JSON { type: "final", text, segments, translation?, target_lang? }.
 */
export class CaptionClient {
  private ws: WebSocket | null = null;
  private pendingLang: string | null = null;

  constructor(
    private readonly url: string,
    /** Called with recognized text and an optional translation. */
    private readonly onCaption: (text: string, translation: string | null) => void,
    private readonly onError: (message: string) => void = () => {}
  ) {}

  connect(): void {
    if (this.ws) return;
    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      // Apply any language chosen before the socket was open.
      if (this.pendingLang) ws.send(`lang:${this.pendingLang}`);
    };

    ws.onmessage = (event) => {
      try {
        const obj = JSON.parse(event.data as string) as {
          type?: string;
          text?: string;
          translation?: string;
          detail?: string;
        };
        if (obj.type === "final") {
          const text = (obj.text ?? "").trim();
          if (text) {
            const translation = obj.translation?.trim() ? obj.translation : null;
            this.onCaption(text, translation);
          }
        } else if (obj.type === "error") {
          this.onError(obj.detail ?? "caption error");
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => this.onError("captions websocket failed");
    this.ws = ws;
  }

  /** Enable live translation into [lang] (a name), or null to disable. */
  setLanguage(lang: string | null): void {
    this.pendingLang = lang;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`lang:${lang ?? "off"}`);
    }
  }

  /** Send a chunk of raw mono PCM16 @ 16 kHz. */
  sendPcm(data: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  /** Ask the server to transcribe everything buffered since the last flush. */
  flush(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send("flush");
  }

  close(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send("close");
    this.ws?.close();
    this.ws = null;
  }
}
