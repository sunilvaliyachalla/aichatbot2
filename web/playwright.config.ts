import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the web client. These drive a real Chromium with fake
 * camera/mic and exercise the full stack: the app + the Socket.IO signaling
 * server (a two-peer P2P call actually connects).
 *
 * The web dev server is started over plain HTTP on localhost (VITE_NO_HTTPS=1):
 * localhost is a secure context, so getUserMedia works, and there is no
 * self-signed cert for Playwright's readiness probe to reject. The signaling
 * server is started too and reached via the Vite /socket.io proxy.
 *
 * AI features (VITE_AI_SERVER_URL=proxy in .env) render, but the specs do not
 * invoke Ollama/Whisper, so no ai-server is required for CI.
 */
// Runs on its own port (default 5174) so an HTTPS dev server on 5173 — e.g. one
// used for live phone testing — is left untouched. Override with E2E_PORT.
const PORT = Number(process.env.E2E_PORT) || 5174;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Start the signaling server and the web dev server for the run.
  webServer: [
    {
      command: "npm --prefix ../server run dev",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run dev",
      env: { VITE_NO_HTTPS: "1", PORT: String(PORT) },
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
