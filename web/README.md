# Web client (React + TypeScript + Vite)

Browser client for the 1:1 WebRTC video call. Media flows peer-to-peer; the
Node server is used only for signaling.

## Local dev (same machine)

```bash
cp .env.example .env        # VITE_SIGNALING_URL can stay blank (uses the proxy)
npm install
npm run dev                 # http://localhost:5173  (or https, see below)
```

Open two browser tabs, enter the same room ID, and join. Camera/mic work on
`localhost` without HTTPS.

## Testing on phones over the LAN (HTTPS)

Phone browsers only grant camera/mic on a **secure context (HTTPS)**. The dev
server serves HTTPS automatically when a self-signed cert is present, and it
**proxies Socket.IO** through the same origin, so the browser makes only secure,
same-origin requests — no mixed-content, no CORS, and only one cert to trust.

1. **Generate a self-signed cert** (once) with your machine's LAN IP(s) in the
   SAN — find them with `hostname -I`:
   ```bash
   mkdir -p certs
   openssl req -x509 -newkey rsa:2048 -nodes \
     -keyout certs/key.pem -out certs/cert.pem -days 365 \
     -subj "/CN=p2p-lan-dev" \
     -addext "subjectAltName=IP:192.168.1.20,IP:127.0.0.1,DNS:localhost"
   ```
   `certs/` and `.env` are gitignored.
2. Leave `VITE_SIGNALING_URL` **blank** in `.env` (the default) so the client
   connects to the page's own origin and rides the proxy.
3. Start the signaling server and the web dev server (two terminals):
   ```bash
   cd ../server && npm run dev        # http://localhost:4000
   cd ../web    && npm run dev        # https://<your-ip>:5173
   ```
   If the signaling server is not on `localhost:4000`, point the proxy at it:
   `SIGNALING_PROXY_TARGET=http://host:4000 npm run dev`.
4. On each phone (same Wi-Fi), open `https://<your-ip>:5173`, accept the
   self-signed cert warning (**Advanced → proceed**), enter the same room ID,
   and grant camera/mic. Two phones = a P2P call.

> On the same LAN, STUN is usually enough. Across the internet, host signaling
> over HTTPS/WSS and configure a TURN server (see the root README).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (HTTPS + Socket.IO proxy when `certs/` exists). |
| `npm run build` | Type-check + production build to `dist/`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Unit + component tests (Vitest/JSDOM). |
| `npm run e2e` | Playwright E2E (real Chromium, fake media). Starts the servers itself. |

## AI features (optional)

Live **captions**, caption **translation**, end-of-call **summary + action
items**, and meeting **Q&A** — powered by the FastAPI [`ai-server/`](../ai-server)
(Whisper + Ollama). They mirror the Android client and are **opt-in**: hidden
unless `VITE_AI_SERVER_URL` is set.

- Set `VITE_AI_SERVER_URL=proxy` in `.env` to route through the Vite AI proxy —
  required over HTTPS (phones) to avoid mixed-content, and the default here.
  Point the proxy at a non-default ai-server with `AI_PROXY_TARGET=...`.
- Start the ai-server (see its README), join a call, tap **💬 Captions**, then
  **🌐** to translate, **📝 Summary**, or type in the **Ask** box.
- The browser captures mic audio via the Web Audio API and streams 16 kHz PCM16
  to `/ws/transcribe`; clients: `src/ai/{CaptionClient,AudioCaptioner,AiClient}.ts`.

Playwright E2E runs on its own port (5174), so an HTTPS dev server on 5173 used
for phone testing is left untouched.
