import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// host: true exposes the dev server on the LAN so you can test across devices
// on the same network (see README "Testing locally on the same network").
//
// LAN phone testing: phone browsers only grant camera/mic on a *secure*
// context (HTTPS). Drop a self-signed cert into ./certs (key.pem + cert.pem)
// and it is picked up automatically; otherwise the server stays plain HTTP.
// Socket.IO is proxied through this same origin so the browser only ever makes
// secure same-origin requests (no mixed-content, no CORS). For that to work,
// point VITE_SIGNALING_URL at this web origin (see .env).
// Set VITE_NO_HTTPS=1 to force plain HTTP even when certs exist (used by the
// Playwright E2E run — localhost is a secure context over HTTP, so getUserMedia
// still works and there is no self-signed cert to trip the readiness probe).
const keyFile = path.resolve("certs/key.pem");
const certFile = path.resolve("certs/cert.pem");
const https =
  process.env.VITE_NO_HTTPS === "1"
    ? undefined
    : fs.existsSync(keyFile) && fs.existsSync(certFile)
      ? { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }
      : undefined;

// Where the Socket.IO signaling server actually runs (proxied to). Override
// with SIGNALING_PROXY_TARGET if it is not on localhost:4000.
const signalingTarget =
  process.env.SIGNALING_PROXY_TARGET ?? "http://localhost:4000";

// FastAPI ai-server (captions / summary / Q&A). Proxied through this origin so
// the HTTPS app can reach an http ai-server without mixed-content/CORS — the
// same trick used for signaling. Override with AI_PROXY_TARGET.
const aiTarget = process.env.AI_PROXY_TARGET ?? "http://localhost:8000";
const aiProxy = { target: aiTarget, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    https,
    proxy: {
      "/socket.io": {
        target: signalingTarget,
        ws: true,
        changeOrigin: true,
      },
      // AI endpoints -> FastAPI ai-server. /ws/transcribe needs ws upgrade.
      "/ws/transcribe": { ...aiProxy, ws: true },
      "/transcribe": aiProxy,
      "/summarize": aiProxy,
      "/translate": aiProxy,
      "/ask": aiProxy,
    },
  },
});
