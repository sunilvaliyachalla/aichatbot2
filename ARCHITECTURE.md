# Architecture

This document describes the architecture of the peer-to-peer (WebRTC) video
call system: its components, layers, data flow, and the signaling protocol.

> TL;DR — **Media is peer-to-peer over WebRTC. The server only relays
> signaling.** Each client is split into UI / signaling / WebRTC / session-state
> layers so concerns stay isolated and the system is easy to extend.

---

## 1. System overview

```
                ┌─────────────────────────────┐
                │      Signaling server        │   Node.js + Socket.IO
                │   (relay-only, no media)     │   • rooms / presence
                └──────┬───────────┬───────────┬──────┘   • SDP & ICE relay
            signaling  │           │           │  signaling
        ┌──────────────▼─┐ ┌───────▼────────┐ ┌▼─────────────────┐
        │   Web client   │ │ Android client │ │   iOS client     │
        │ React + TS+Vite│ │ Kotlin+Compose │ │ Swift + SwiftUI  │
        └──────────────┬─┘ └───────┬────────┘ └┬─────────────────┘
                       │     WebRTC │           │
                       └────────────┴───────────┘
                  direct P2P media (audio/video)
                  STUN for NAT traversal; TURN optional
```

Deployable components:

| Component | Stack | Responsibility |
| --- | --- | --- |
| `server/` | Node.js + TypeScript + Socket.IO | Signaling only: rooms, presence, relay |
| `web/` | React + TypeScript + Vite | Browser client |
| `android/` | Kotlin + Jetpack Compose + WebRTC | Native Android client |
| `ios/` | Swift + SwiftUI + WebRTC | Native iOS client |
| `ai-server/` | Python + FastAPI (+ Ollama) | Optional AI side-channel (captions, translate, summary, Q&A) |

---

## 2. Layered design (per client)

All three clients use the same four-layer separation:

| Layer | Web (`web/src`) | Android (`android/.../p2pcall`) | iOS (`ios/P2PCall`) | Responsibility |
| --- | --- | --- | --- | --- |
| **UI** | `components/*`, `App.tsx` | `ui/*` (Compose) | `UI/*` (SwiftUI) | Render state, capture user intent |
| **Session/state** | `hooks/useCall.ts` | `call/CallViewModel.kt` | `Call/CallViewModel.swift` | Orchestrate a call, hold call state |
| **Signaling** | `signaling/SignalingClient.ts` | `signaling/SignalingClient.kt` | `Signaling/SignalingClient.swift` | Socket.IO transport, lifecycle events |
| **WebRTC** | `webrtc/PeerConnection.ts` | `webrtc/RtcClient.kt` | `WebRTC/RtcClient.swift` | `RTCPeerConnection`, tracks, ICE, cleanup |

The iOS client renders video by bridging `RTCMTLVideoView` (Metal) into SwiftUI
via `UI/RTCVideoView.swift`, the counterpart to Android's `SurfaceViewRenderer`
bridge.

Cross-cutting:

- **Config** — `web/src/config.ts` (+ pure `lib/iceConfig.ts`),
  `android/.../config/Config.kt`, and `ios/.../Config/Config.swift`. All
  signaling URLs and ICE servers come from environment variables / Gradle
  properties (Android) / Info.plist build settings (iOS).
- **Protocol helpers** — `web/src/lib/protocol.ts` holds the pure,
  unit-tested negotiation/signal-construction logic shared by the layers.

This separation means, e.g., the signaling transport can change (Socket.IO →
raw WebSocket) without touching the WebRTC layer, and the WebRTC layer can be
unit-reasoned independently of the UI.

---

## 3. Signaling server

Single-process, in-memory, **relay-only**. It never inspects or stores media;
it routes SDP/ICE between peers and tracks room membership.

- `src/server.ts` — `createSignalingServer()` builds Express + Socket.IO and
  wires the protocol. Construction is separated from `listen()` so it is
  trivially integration-testable.
- `src/rooms.ts` — `RoomRegistry`: room → set of socket ids; deletes a room
  when it becomes empty.
- `src/index.ts` — thin entrypoint: reads config, listens, graceful shutdown.

**Scaling note:** to run multiple instances, add the Socket.IO **Redis
adapter**. The protocol is unchanged; only fan-out across nodes changes.

---

## 4. Signaling protocol

Transport: **Socket.IO**. SDP/ICE payloads (`data`) shape:

```jsonc
{ "kind": "offer",  "sdp": "<sdp>" }
{ "kind": "answer", "sdp": "<sdp>" }
{ "kind": "candidate", "candidate": "<str>", "sdpMid": "0", "sdpMLineIndex": 0 }
```

**Client → Server**

| Event | Payload | Ack | Purpose |
| --- | --- | --- | --- |
| `join-room` | `{ roomId }` | `{ ok, selfId, peers[] }` / `{ ok:false, reason }` | Join/create room |
| `signal` | `{ to, data }` | — | Relay `data` to one peer |
| `leave-room` | `{ roomId }` | — | Leave explicitly |
| _disconnect_ | (built-in) | — | Triggers `peer-left` |

**Server → Client**

| Event | Payload | Meaning |
| --- | --- | --- |
| `peer-joined` | `{ peerId }` | Newcomer joined your room |
| `peer-left` | `{ peerId }` | Peer left/disconnected |
| `signal` | `{ from, data }` | Relayed signaling message |

**Glare-free 1:1 rule:** the **newcomer initiates** the offer (it learns of
existing peers via the `join-room` ack); the existing peer answers.

---

## 5. Call lifecycle (1:1)

```
A joins room  ── join-room ──▶ server      (peers: [])  → A waits
B joins room  ── join-room ──▶ server      (peers: [A]) → B is initiator
server ── peer-joined{B} ──▶ A
B: createOffer → setLocalDescription ── signal(offer) ─▶ server ─▶ A
A: setRemoteDescription(offer) → createAnswer ── signal(answer) ─▶ B
both: trickle ICE candidates ── signal(candidate) ◀─▶ (via server)
ICE connectivity established  ──▶  MEDIA FLOWS DIRECTLY (P2P)
B leaves / disconnects ── peer-left{B} ─▶ A  → A tears down peer, waits
```

Reconnect: the Socket.IO client auto-reconnects; on `reconnect` the client
re-joins the room and rebuilds the `RTCPeerConnection`.

Cleanup is centralized (`useCall.cleanup` / Android `CallViewModel.cleanup` +
`onCleared` / iOS `CallViewModel.cleanup` + `deinit`): stop tracks, close the
peer connection, leave the room, and disconnect the socket. The WebRTC layer
also releases senders/receivers.

---

## 6. NAT traversal

- **STUN** (default) discovers each peer's public address for direct
  connectivity — sufficient on most home/office networks.
- **TURN** (optional, configurable) relays media when direct P2P is blocked
  (symmetric NAT / strict firewalls). Enabled only when URL + username +
  credential are all set, on both clients.

---

## 7. Testing strategy

- **Server:** unit (`RoomRegistry`, validation) + **functional integration**
  using real Socket.IO clients against an ephemeral-port server.
- **Web:** unit (pure `lib/` logic) + **functional** React component/app-flow
  tests (JSDOM, mocked media/socket).

Pure logic is extracted into framework-free modules so the most important
behavior is tested without browsers or devices.

---

## 8. Extensibility

The per-peer connection objects and one-to-one signal routing are already
shaped for growth:

- **Group calls** — maintain a `Map<peerId, PeerConnection>` (mesh) or add an
  SFU for larger rooms; the `signal{to}` routing already targets individuals.
- **Screen share** — add a display track via `getDisplayMedia` / Android
  screen-capture and renegotiate.
- **Chat / data** — add an `RTCDataChannel` or a `chat` signaling event.
- **AI features** — an optional Python FastAPI (+ Ollama) side-channel
  (`ai-server/`) provides live captions, translation, summaries, and grounded
  Q&A. Both the Android and iOS clients integrate it via `ai/*` / `AI/*`
  (opt-in; hidden when no AI server is configured). See
  [`AI_ROADMAP.md`](./AI_ROADMAP.md) for the broader plan.
