# Android client (Kotlin + Jetpack Compose + WebRTC)

Native 1:1 WebRTC video calling. Mirrors the web client's architecture:

- `signaling/SignalingClient.kt` — Socket.IO signaling layer.
- `webrtc/RtcClient.kt` — `PeerConnection`, local camera/mic tracks, cleanup.
- `call/CallViewModel.kt` — session/state management (lifecycle-safe in `onCleared`).
- `ui/` — Compose screens (`LobbyScreen`, `CallScreen`) + `SurfaceViewRenderer` bridge.

## Setup

1. **SDK path** — copy the example and set your SDK location:
   ```bash
   cp local.properties.example local.properties
   # edit sdk.dir=...
   ```
2. **Gradle wrapper** — this repo does not check in the binary
   `gradle/wrapper/gradle-wrapper.jar`. Generate it once (or just open the
   project in Android Studio, which does it for you):
   ```bash
   gradle wrapper --gradle-version 8.7
   ```
3. **Configure signaling/ICE** — defaults live in `gradle.properties`; override
   per machine in `local.properties`:
   - Emulator → host: `SIGNALING_URL=http://10.0.2.2:4000` (default).
   - Physical device on LAN: `SIGNALING_URL=http://<host-ip>:4000`.

   You can also change the server **at runtime**: the lobby screen has a
   **Server URL** field (pre-filled with the build default). Type any private
   IP / LAN host / URL — e.g. `http://192.168.1.20:4000` — and it is used and
   persisted for future launches, so you can repoint the app without
   rebuilding. Cleartext HTTP to LAN IPs is already permitted for development
   (see `res/xml/network_security_config.xml`).

## Run

```bash
./gradlew installDebug      # build + install on a connected device/emulator
# or: open in Android Studio and press Run
```

Grant **Camera** and **Microphone** permissions when prompted, enter a room ID
matching the other client, and join.

## Notes

- WebRTC comes from `io.getstream:stream-webrtc-android` (maintained, exposes
  the standard `org.webrtc.*` API).
- Cleartext HTTP to local/LAN IPs is allowed for development via
  `res/xml/network_security_config.xml`. Use HTTPS/WSS in production and remove
  the cleartext exceptions.
- TURN is optional — set `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` to enable.
