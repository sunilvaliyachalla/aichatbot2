# iOS client (Swift + SwiftUI + WebRTC)

Native 1:1 WebRTC video calling for iOS. A functional and visual port of the
[Android client](../android), sharing the same signaling protocol, layered
architecture, and optional AI features.

| Layer | iOS | Android equivalent |
| --- | --- | --- |
| Signaling | `Signaling/SignalingClient.swift` (Socket.IO) | `signaling/SignalingClient.kt` |
| WebRTC | `WebRTC/RtcClient.swift` (`RTCPeerConnection`, camera/mic) | `webrtc/RtcClient.kt` |
| Session/state | `Call/CallViewModel.swift` (`ObservableObject`) | `call/CallViewModel.kt` |
| UI | `UI/` SwiftUI views + `RTCMTLVideoView` bridge | `ui/` Compose screens |
| AI side-channel | `AI/*` (captions, translate, summary, Q&A) | `ai/*` |

Media flows directly peer-to-peer over WebRTC; the Node.js signaling server is
used only to relay SDP/ICE. See the repo [README](../README.md) and
[ARCHITECTURE](../ARCHITECTURE.md) for the full system design.

## Requirements

- macOS with **Xcode 15+**
- [**XcodeGen**](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)

The `.xcodeproj` is **generated** from [`project.yml`](./project.yml) (and
git-ignored), the same way the Android module is described by Gradle rather than
checked-in IDE state. Dependencies are resolved via Swift Package Manager:

- [`stasel/WebRTC`](https://github.com/stasel/WebRTC) — maintained WebRTC binary
  (the iOS counterpart to `io.getstream:stream-webrtc-android`).
- [`socket.io-client-swift`](https://github.com/socketio/socket.io-client-swift)
  — Socket.IO signaling client.

## Setup & run

```bash
cd ios
brew install xcodegen      # one time
xcodegen generate          # produces P2PCall.xcodeproj
open P2PCall.xcodeproj      # then press Run (⌘R)
```

Grant **Camera** and **Microphone** permissions when prompted, enter a room ID
matching the other client, and join.

> **Simulator networking:** the iOS Simulator reaches your host machine via
> `localhost` (unlike the Android emulator's `10.0.2.2`). The camera is **not**
> available in the Simulator — use a physical device to actually see video.

## Configuration

Defaults live in the `settings.base` block of [`project.yml`](./project.yml) and
are surfaced to Swift through Info.plist substitution — the iOS analogue of
Android's `gradle.properties` → `BuildConfig`. Read at runtime by
[`Config/Config.swift`](./P2PCall/Config/Config.swift).

| Key | Default | Notes |
| --- | --- | --- |
| `SIGNALING_URL` | `http://localhost:4000` | Signaling server. Use the host LAN IP for a physical device. |
| `STUN_URLS` | Google STUN | Comma-separated. |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | _(empty)_ | Optional TURN; all three required to enable. |
| `AI_SERVER_URL` | `http://localhost:8000` | FastAPI AI server. `ws://` for live captions is derived automatically. Blank hides AI features. |

To override, edit the values in `project.yml` and re-run `xcodegen generate`
(or supply your own `xcconfig`).

## AI features (optional)

When `AI_SERVER_URL` is set, the call screen shows controls backed by the
[`ai-server`](../ai-server) (FastAPI + Ollama):

- **Captions** — live transcription over a WebSocket (`/ws/transcribe`); the mic
  is captured as 16 kHz mono PCM16 via `AVAudioEngine`.
- **Translate** — cycles the caption translation target (Off → Spanish → French → Hindi).
- **Summarize** — posts the transcript to `/summarize` for a summary + action items.
- **Ask** — grounded Q&A over the transcript via `/ask`.

## Notes

- Cleartext HTTP/WS to local/LAN servers is allowed for development via
  `NSAllowsArbitraryLoads` (mirrors the Android `network_security_config`). Use
  HTTPS/WSS in production and tighten App Transport Security.
- `RTCMTLVideoView` (Metal) renders video; the local preview is mirrored.
- TURN is optional — set `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` to enable.

## CI

[`.github/workflows/ios-build.yml`](../.github/workflows/ios-build.yml) compiles
the app on a macOS runner: it installs XcodeGen, generates the project, resolves
the SPM packages, and runs `xcodebuild` for the iOS Simulator (no code signing).
