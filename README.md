# P2P Video Call

A production-oriented **peer-to-peer (WebRTC) 1:1 video call** starter with two
clients and a minimal signaling server:

| Component | Stack | Folder |
| --- | --- | --- |
| Signaling server | Node.js + TypeScript + Socket.IO | [`server/`](./server) |
| Web client | React + TypeScript + Vite | [`web/`](./web) |
| Android client | Kotlin + Jetpack Compose + WebRTC | [`android/`](./android) |
| AI server (optional) | Python + FastAPI (+ Ollama) | [`ai-server/`](./ai-server) |

**Media flows directly between peers over WebRTC.** The server is used *only* for
signaling: room management, presence, and relaying SDP offers/answers and ICE
candidates. It never touches audio/video. STUN is used by default; TURN is
optional and configurable for networks where direct P2P is blocked.

> 📐 See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full system design, and
> [`AI_ROADMAP.md`](./AI_ROADMAP.md) for AI features planned on a Python FastAPI
> backend + Android.

---

## Architecture

```
        ┌────────────────────────┐
        │   Signaling server     │   Socket.IO, relay-only
        │  (Node.js + Socket.IO) │   • rooms / presence
        └───────────┬────────────┘   • offer/answer/ICE relay
            signaling │ signaling
        ┌───────────▼─────────┐   ┌─────────────────────┐
        │   Web client (React)│   │ Android client (KT) │
        └───────────┬─────────┘   └──────────┬──────────┘
                    │      WebRTC media (P2P)  │
                    └──────────────────────────┘
                      audio/video goes directly
```

Each client is split into clear layers:

- **UI layer** — React components / Compose screens.
- **Signaling layer** — `SignalingClient` (Socket.IO wrapper).
- **WebRTC layer** — `PeerConnection` (web) / `RtcClient` (Android).
- **Session/state layer** — `useCall` hook (web) / `CallViewModel` (Android).

---

## Signaling protocol

Transport: **Socket.IO**. The server only relays; it never inspects or stores
media. SDP/ICE payloads (`data`) use this shape:

```jsonc
// offer / answer
{ "kind": "offer",  "sdp": "<sdp>" }
{ "kind": "answer", "sdp": "<sdp>" }
// ICE candidate
{ "kind": "candidate", "candidate": "<str>", "sdpMid": "0", "sdpMLineIndex": 0 }
```

### Client → Server

| Event | Payload | Ack | Purpose |
| --- | --- | --- | --- |
| `join-room` | `{ roomId }` | `{ ok: true, selfId, peers[] }` or `{ ok: false, reason }` | Join/create a room. `peers` are those already present. |
| `signal` | `{ to, data }` | — | Relay `data` to one peer in the room. |
| `leave-room` | `{ roomId }` | — | Leave a room explicitly. |
| _disconnect_ | (built-in) | — | Triggers `peer-left` for the room. |

`reason` is `"room-full"` (1:1 limit reached) or `"invalid-room"`.

### Server → Client

| Event | Payload | Meaning |
| --- | --- | --- |
| `peer-joined` | `{ peerId }` | A newcomer joined your room. |
| `peer-left` | `{ peerId }` | A peer left/disconnected. |
| `signal` | `{ from, data }` | A relayed signaling message. |

### Negotiation rule (glare-free 1:1)

> **The newcomer initiates.** When `join-room` returns a non-empty `peers`
> list, that client creates the **offer**. The existing peer receives
> `peer-joined` and waits for the offer, then answers.

The room is deleted automatically when its last peer leaves.

---

## Quick start (local, same machine)

Open three terminals.

### 1. Signaling server

```bash
cd server
cp .env.example .env
npm install
npm run dev            # http://localhost:4000  (GET /health to check)
```

### 2. Web client

```bash
cd web
cp .env.example .env   # VITE_SIGNALING_URL=http://localhost:4000
npm install
npm run dev            # http://localhost:5173
```

Open the web app in **two browser tabs**, enter the same room ID in both, and
join. (Camera/mic permission requires `localhost` or HTTPS — see notes below.)

### 3. Android client

```bash
cd android
cp local.properties.example local.properties   # set sdk.dir
# Emulator reaches your host at 10.0.2.2 (already the default SIGNALING_URL).
./gradlew installDebug    # or open in Android Studio and Run
```

---

## Configuration (environment-based)

### Server — `server/.env`
| Var | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | Listen port. |
| `CORS_ORIGIN` | `*` | Comma-separated origins; use explicit origins in prod. |
| `MAX_PEERS_PER_ROOM` | `2` | 1:1 by default. |

### Web — `web/.env`
| Var | Default | Notes |
| --- | --- | --- |
| `VITE_SIGNALING_URL` | `http://localhost:4000` | Signaling server URL. |
| `VITE_STUN_URLS` | Google STUN | Comma-separated STUN URLs. |
| `VITE_TURN_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` | _(empty)_ | Optional TURN; all three required to enable. |

### Android — `android/gradle.properties` (override in `local.properties`)
| Var | Default | Notes |
| --- | --- | --- |
| `SIGNALING_URL` | `http://10.0.2.2:4000` | `10.0.2.2` = host from emulator. |
| `STUN_URLS` | Google STUN | Comma-separated. |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | _(empty)_ | Optional TURN. |

---

## Testing across devices / networks

### Same Wi‑Fi / LAN
1. Find your host machine's LAN IP (e.g. `192.168.1.20`).
2. **Server** already binds all interfaces. **Web**: set
   `VITE_SIGNALING_URL=http://192.168.1.20:4000` and open the Vite "Network"
   URL on the other device. **Android (physical device)**: set
   `SIGNALING_URL=http://192.168.1.20:4000` in `local.properties`.
3. STUN is usually enough on the same LAN.

> **getUserMedia needs a secure context.** Browsers only grant camera/mic on
> `http://localhost` or HTTPS. To open the web app from another device by IP,
> serve it over HTTPS (e.g. a reverse proxy / `mkcert`) or use a tunnel
> (ngrok/Cloudflare Tunnel). The Android app has no such restriction.

### Across the internet (different networks)
- Host the signaling server publicly over **HTTPS/WSS**.
- Direct P2P often fails behind symmetric NAT/firewalls — **configure a TURN
  server** (e.g. [coturn](https://github.com/coturn/coturn)) and set the
  `*_TURN_*` variables on both clients. TURN relays media when a direct path
  can't be established.

---

## Running the tests

```bash
# Signaling server: unit (rooms) + functional (real Socket.IO clients)
cd server && npm install && npm test

# Web: unit (ice/protocol) + functional (React components & App flow)
cd web && npm install && npm test
```

Both suites are pure Node/JSDOM and need no devices or a running server.

---

## Production hardening checklist

- Serve signaling over **HTTPS/WSS**; restrict `CORS_ORIGIN`.
- Run a **TURN** server; rotate TURN credentials (use short-lived tokens).
- Add auth to `join-room` (JWT) and rate-limit signaling.
- For scale-out, add the **Socket.IO Redis adapter** (protocol is unchanged).

## Extending later

The layered design leaves room for: group calls (mesh/SFU), screen share
(`getDisplayMedia` / extra track), and chat (a `DataChannel` or a `chat`
signaling event). The signaling protocol and per-peer connection classes are
already structured to support multiple peers.

## License

MIT — sample/starter code.
