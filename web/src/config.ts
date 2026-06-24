import { buildIceServers } from "./lib/iceConfig";

/**
 * Environment-based configuration. Values come from Vite env vars (VITE_*).
 * See .env.example for the full list. ICE building lives in ./lib/iceConfig
 * (pure + unit-tested).
 */
export const config = {
  signalingUrl: import.meta.env.VITE_SIGNALING_URL ?? "http://localhost:4000",
  iceServers: buildIceServers({
    stunUrls: import.meta.env.VITE_STUN_URLS,
    turnUrl: import.meta.env.VITE_TURN_URL,
    turnUsername: import.meta.env.VITE_TURN_USERNAME,
    turnCredential: import.meta.env.VITE_TURN_CREDENTIAL,
  }),
} as const;
