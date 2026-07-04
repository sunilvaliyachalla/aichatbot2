import { buildIceServers } from "./lib/iceConfig";

/**
 * Environment-based configuration. Values come from Vite env vars (VITE_*).
 * See .env.example for the full list. ICE building lives in ./lib/iceConfig
 * (pure + unit-tested).
 */

// Signaling URL resolution:
//   1. VITE_SIGNALING_URL when set (explicit server, e.g. LAN IP or prod).
//   2. Otherwise the page's own origin — works with the Vite Socket.IO proxy,
//      so LAN phones connect to the same secure origin they loaded the app from
//      regardless of which IP they used. Falls back to localhost outside a browser.
const envSignalingUrl = import.meta.env.VITE_SIGNALING_URL?.trim();
const sameOrigin =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:4000";

// AI server resolution (mirrors the FastAPI ai-server the Android app uses):
//   • blank / unset  -> AI features hidden (opt-in, like Android).
//   • "proxy" or "/" -> the page's own origin, via the Vite AI proxy. Use this
//                       for HTTPS / LAN phone testing (no mixed-content/CORS).
//   • full URL       -> that server directly (desktop http dev only).
const aiEnv = import.meta.env.VITE_AI_SERVER_URL?.trim();
const aiEnabled = !!aiEnv;
const aiBase =
  !aiEnv || aiEnv === "proxy" || aiEnv === "/" ? "" : aiEnv.replace(/\/+$/, "");

/** Build a ws(s) URL for [path], deriving the scheme from the base/page. */
function aiWsUrl(path: string): string {
  if (aiBase) return aiBase.replace(/^http/, "ws") + path;
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${path}`;
  }
  return `ws://localhost:8000${path}`;
}

export const config = {
  signalingUrl: envSignalingUrl ? envSignalingUrl : sameOrigin,
  iceServers: buildIceServers({
    stunUrls: import.meta.env.VITE_STUN_URLS,
    turnUrl: import.meta.env.VITE_TURN_URL,
    turnUsername: import.meta.env.VITE_TURN_USERNAME,
    turnCredential: import.meta.env.VITE_TURN_CREDENTIAL,
  }),
  ai: {
    enabled: aiEnabled,
    /** WebSocket for live captions (streams PCM16 @ 16 kHz). */
    captionsWsUrl: aiWsUrl("/ws/transcribe"),
    /** REST endpoint for end-of-call summaries. */
    summaryUrl: `${aiBase}/summarize`,
    /** REST endpoint for meeting Q&A grounded in the transcript. */
    askUrl: `${aiBase}/ask`,
  },
} as const;
