import Foundation
import Combine
import WebRTC

/// Room/session state management for iOS. Wires the signaling client to the
/// WebRTC client for a 1:1 call and publishes immutable `CallState` plus the
/// local and remote video tracks for rendering. All teardown happens in
/// `cleanup()` so resources are released deterministically. The iOS counterpart
/// to Android's `CallViewModel`.
@MainActor
final class CallViewModel: ObservableObject {

    @Published private(set) var state = CallState(aiAvailable: Config.aiEnabled)
    @Published private(set) var localTrack: RTCVideoTrack?
    @Published private(set) var remoteTrack: RTCVideoTrack?

    private var signaling: SignalingClient?
    private var rtc: RtcClient?
    private var remotePeerId: String?
    private var roomId: String?

    // AI captions/summary
    private var captioner: AudioCaptioner?
    private var captionClient: AiCaptionClient?
    private var transcript = ""

    // MARK: - Join / signaling

    func join(_ room: String) {
        let trimmed = room.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            update { $0.status = .error; $0.error = "Please enter a room ID." }
            return
        }
        roomId = trimmed
        update { $0.status = .connecting; $0.roomId = trimmed; $0.error = nil }

        let client = RtcClient(iceServers: Config.iceServers(), listener: rtcListener())
        client.initLocalMedia()
        localTrack = client.localVideoTrack
        rtc = client

        let signalingClient = SignalingClient(url: Config.signalingUrl, listener: signalingListener())
        signaling = signalingClient
        signalingClient.connect()
    }

    private func signalingListener() -> SignalingClient.Listener {
        var l = SignalingClient.Listener()

        l.onConnected = { [weak self] in
            Task { @MainActor in
                guard let self = self, let room = self.roomId else { return }
                self.signaling?.joinRoom(room) { [weak self] ok, peers, reason in
                    Task { @MainActor in
                        guard let self = self else { return }
                        if !ok {
                            self.update {
                                $0.status = .error
                                $0.error = reason == "room-full"
                                    ? "Room is full (1:1 only)."
                                    : "Could not join room."
                            }
                            return
                        }
                        if let first = peers.first {
                            // Existing peer present -> we are the initiator.
                            self.remotePeerId = first
                            self.rtc?.createPeerConnection(initiator: true)
                        } else {
                            self.update { $0.status = .waiting }
                        }
                    }
                }
            }
        }

        l.onDisconnected = { [weak self] in
            Task { @MainActor in self?.update { $0.status = .reconnecting } }
        }

        l.onReconnected = { [weak self] in
            Task { @MainActor in
                guard let self = self, let room = self.roomId else { return }
                // Re-join after a transport reconnect; rebuild the peer connection.
                self.rtc?.closePeerConnection()
                self.remoteTrack = nil
                self.signaling?.joinRoom(room) { [weak self] ok, peers, _ in
                    Task { @MainActor in
                        guard let self = self else { return }
                        if ok, let first = peers.first {
                            self.remotePeerId = first
                            self.rtc?.createPeerConnection(initiator: true)
                        } else {
                            self.update { $0.status = .waiting }
                        }
                    }
                }
            }
        }

        l.onPeerJoined = { [weak self] peerId in
            Task { @MainActor in
                guard let self = self else { return }
                // Newcomer is the initiator; we wait for their offer.
                self.remotePeerId = peerId
                self.rtc?.createPeerConnection(initiator: false)
            }
        }

        l.onPeerLeft = { [weak self] peerId in
            Task { @MainActor in
                guard let self = self else { return }
                if peerId == self.remotePeerId {
                    self.rtc?.closePeerConnection()
                    self.remotePeerId = nil
                    self.remoteTrack = nil
                    self.update { $0.status = .waiting }
                }
            }
        }

        l.onSignal = { [weak self] from, data in
            Task { @MainActor in
                guard let self = self else { return }
                if self.remotePeerId == nil {
                    self.remotePeerId = from
                    self.rtc?.createPeerConnection(initiator: false)
                }
                self.rtc?.handleRemoteSignal(data)
            }
        }

        return l
    }

    private func rtcListener() -> RtcClient.Listener {
        var l = RtcClient.Listener()

        l.onLocalSignal = { [weak self] data in
            Task { @MainActor in
                guard let self = self, let to = self.remotePeerId else { return }
                self.signaling?.sendSignal(to: to, data: data)
            }
        }

        l.onRemoteVideoTrack = { [weak self] track in
            Task { @MainActor in
                guard let self = self else { return }
                self.remoteTrack = track
                self.update { $0.status = .connected }
            }
        }

        l.onConnectionStateChange = { [weak self] newState in
            Task { @MainActor in
                guard let self = self else { return }
                switch newState {
                case .connected:
                    self.update { $0.status = .connected }
                case .disconnected, .failed:
                    self.update { $0.status = .reconnecting }
                default:
                    break
                }
            }
        }

        return l
    }

    // MARK: - Media toggles

    func toggleMic() {
        let enabled = !state.micEnabled
        rtc?.setMicEnabled(enabled)
        update { $0.micEnabled = enabled }
    }

    func toggleCamera() {
        let enabled = !state.cameraEnabled
        rtc?.setCameraEnabled(enabled)
        update { $0.cameraEnabled = enabled }
    }

    // MARK: - AI features

    /// Toggle live AI captions. Requires microphone permission (granted before
    /// joining) and a configured AI server. Opt-in by design.
    func toggleCaptions() {
        guard Config.aiEnabled else { return }
        let enabling = !state.captionsEnabled
        if enabling {
            let client = AiCaptionClient(
                wsUrl: Config.aiCaptionsWsUrl,
                onCaption: { [weak self] line, translation in
                    Task { @MainActor in
                        guard let self = self else { return }
                        self.transcript += line + "\n"
                        self.update {
                            $0.caption = line
                            $0.captionTranslation = translation ?? ""
                        }
                    }
                },
                onError: { msg in print("CallViewModel captions: \(msg)") }
            )
            captionClient = client
            let cap = AudioCaptioner(client: client)
            captioner = cap
            do {
                try cap.start()
                // Re-apply any previously chosen translation language.
                client.setLanguage(state.captionLanguage)
                update { $0.captionsEnabled = true }
            } catch {
                update { $0.error = "Microphone permission required for captions." }
            }
        } else {
            captioner?.stop()
            captioner = nil
            captionClient = nil
            update {
                $0.captionsEnabled = false
                $0.caption = ""
                $0.captionTranslation = ""
            }
        }
    }

    /// Cycle the live-translation target language: Off → Spanish → French → Hindi → Off.
    func cycleCaptionLanguage() {
        guard Config.aiEnabled else { return }
        let order: [String?] = [nil, "Spanish", "French", "Hindi"]
        let current = order.firstIndex(where: { $0 == state.captionLanguage }) ?? 0
        let next = order[(current + 1) % order.count]
        captionClient?.setLanguage(next)
        update { $0.captionLanguage = next; $0.captionTranslation = "" }
    }

    /// Summarize the accumulated transcript via the FastAPI/Ollama backend.
    func requestSummary() {
        guard Config.aiEnabled, !transcript.isEmpty else { return }
        let text = transcript
        update { $0.summarizing = true; $0.error = nil }
        Task {
            do {
                let result = try await AiSummaryClient(summaryUrl: Config.aiSummaryUrl).summarize(text)
                update {
                    $0.summarizing = false
                    $0.summary = result.summary
                    $0.actionItems = result.actionItems
                }
            } catch {
                update { $0.summarizing = false; $0.error = "Summary failed: \(error.localizedDescription)" }
            }
        }
    }

    func dismissSummary() {
        update { $0.summary = nil; $0.actionItems = [] }
    }

    /// Ask a question grounded in the live transcript (FastAPI/Ollama /ask).
    func ask(_ question: String) {
        guard Config.aiEnabled, !question.isEmpty, !transcript.isEmpty else { return }
        let text = transcript
        update { $0.asking = true; $0.error = nil }
        Task {
            do {
                let answer = try await AiQaClient(askUrl: Config.aiAskUrl).ask(transcript: text, question: question)
                update { $0.asking = false; $0.answer = answer }
            } catch {
                update { $0.asking = false; $0.error = "Ask failed: \(error.localizedDescription)" }
            }
        }
    }

    func dismissAnswer() {
        update { $0.answer = nil }
    }

    // MARK: - Teardown

    func hangup() {
        cleanup()
        state = CallState(status: .ended, aiAvailable: Config.aiEnabled)
    }

    private func cleanup() {
        captioner?.stop()
        captioner = nil
        captionClient = nil
        transcript = ""
        if let room = roomId { signaling?.leaveRoom(room) }
        signaling?.disconnect()
        signaling = nil
        rtc?.dispose()
        rtc = nil
        remotePeerId = nil
        roomId = nil
        localTrack = nil
        remoteTrack = nil
    }

    private func update(_ transform: (inout CallState) -> Void) {
        var copy = state
        transform(&copy)
        state = copy
    }

    deinit {
        // ViewModel is @MainActor; cleanup() touches main-actor state, so hop on.
        let captioner = self.captioner
        let signaling = self.signaling
        let rtc = self.rtc
        captioner?.stop()
        signaling?.disconnect()
        rtc?.dispose()
    }
}
