import Foundation
import WebRTC

/// WebRTC peer connection layer. Owns the `RTCPeerConnectionFactory`, the local
/// camera/mic tracks and a single `RTCPeerConnection` for a 1:1 call. Media
/// flows directly peer-to-peer; this class emits signaling via
/// `Listener.onLocalSignal` and never touches the socket — the iOS counterpart
/// to Android's `RtcClient`.
///
/// All WebRTC objects are created/disposed here so the view model can guarantee
/// lifecycle-safe cleanup by calling `dispose()`.
final class RtcClient: NSObject {

    struct Listener {
        /// A signaling message to relay to the remote peer (offer/answer/candidate).
        var onLocalSignal: (_ data: [String: Any]) -> Void = { _ in }
        var onRemoteVideoTrack: (_ track: RTCVideoTrack) -> Void = { _ in }
        var onConnectionStateChange: (_ state: RTCPeerConnectionState) -> Void = { _ in }
    }

    private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        let encoder = RTCDefaultVideoEncoderFactory()
        let decoder = RTCDefaultVideoDecoderFactory()
        return RTCPeerConnectionFactory(encoderFactory: encoder, decoderFactory: decoder)
    }()

    private let iceServers: [RTCIceServer]
    private let listener: Listener

    private var peerConnection: RTCPeerConnection?

    private var videoCapturer: RTCCameraVideoCapturer?
    private var videoSource: RTCVideoSource?
    private(set) var localVideoTrack: RTCVideoTrack?
    private var localAudioTrack: RTCAudioTrack?

    private var isInitiator = false
    private let streamId = "local_stream"

    init(iceServers: [RTCIceServer], listener: Listener) {
        self.iceServers = iceServers
        self.listener = listener
        super.init()
    }

    /// Acquire camera + mic and build local tracks. Call before `createPeerConnection`.
    func initLocalMedia() {
        let factory = RtcClient.factory

        let audioConstraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let audioSource = factory.audioSource(with: audioConstraints)
        localAudioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")

        let source = factory.videoSource()
        videoSource = source
        let capturer = RTCCameraVideoCapturer(delegate: source)
        videoCapturer = capturer
        localVideoTrack = factory.videoTrack(with: source, trackId: "video0")
        startCapture(capturer)
    }

    /// Create the peer connection and attach local tracks.
    func createPeerConnection(initiator: Bool) {
        isInitiator = initiator

        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually

        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        guard let pc = RtcClient.factory.peerConnection(with: config, constraints: constraints, delegate: self) else {
            return
        }
        peerConnection = pc

        if let video = localVideoTrack { pc.add(video, streamIds: [streamId]) }
        if let audio = localAudioTrack { pc.add(audio, streamIds: [streamId]) }

        // The initiator (newcomer) drives negotiation by creating the offer.
        if isInitiator { createOffer() }
    }

    private func createOffer() {
        guard let pc = peerConnection else { return }
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        pc.offer(for: constraints) { [weak self] sdp, _ in
            guard let self = self, let sdp = sdp else { return }
            pc.setLocalDescription(sdp) { _ in }
            self.listener.onLocalSignal(["kind": "offer", "sdp": sdp.sdp])
        }
    }

    /// Handle an incoming signaling message routed from the remote peer.
    func handleRemoteSignal(_ data: [String: Any]) {
        guard let pc = peerConnection else { return }
        switch data["kind"] as? String {
        case "offer":
            let offer = RTCSessionDescription(type: .offer, sdp: data["sdp"] as? String ?? "")
            pc.setRemoteDescription(offer) { [weak self] error in
                guard error == nil, let self = self else { return }
                let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
                pc.answer(for: constraints) { sdp, _ in
                    guard let sdp = sdp else { return }
                    pc.setLocalDescription(sdp) { _ in }
                    self.listener.onLocalSignal(["kind": "answer", "sdp": sdp.sdp])
                }
            }

        case "answer":
            let answer = RTCSessionDescription(type: .answer, sdp: data["sdp"] as? String ?? "")
            pc.setRemoteDescription(answer) { _ in }

        case "candidate":
            let candidate = RTCIceCandidate(
                sdp: data["candidate"] as? String ?? "",
                sdpMLineIndex: Int32((data["sdpMLineIndex"] as? Int) ?? 0),
                sdpMid: data["sdpMid"] as? String
            )
            pc.add(candidate) { _ in }

        default:
            break
        }
    }

    func setMicEnabled(_ enabled: Bool) {
        localAudioTrack?.isEnabled = enabled
    }

    func setCameraEnabled(_ enabled: Bool) {
        localVideoTrack?.isEnabled = enabled
    }

    /// Close the current peer connection but keep local media (for reconnect).
    func closePeerConnection() {
        peerConnection?.close()
        peerConnection = nil
    }

    /// Full lifecycle-safe teardown of every WebRTC resource.
    func dispose() {
        peerConnection?.close()
        peerConnection = nil

        videoCapturer?.stopCapture()
        videoCapturer = nil
        videoSource = nil
        localVideoTrack = nil
        localAudioTrack = nil
    }

    // MARK: - Camera

    private func startCapture(_ capturer: RTCCameraVideoCapturer) {
        let devices = RTCCameraVideoCapturer.captureDevices()
        // Prefer the front camera for video calls.
        guard let device = devices.first(where: { $0.position == .front }) ?? devices.first else {
            return
        }

        let target = 1280 * 720
        let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
        let format = formats.min { a, b in
            let da = CMVideoFormatDescriptionGetDimensions(a.formatDescription)
            let db = CMVideoFormatDescriptionGetDimensions(b.formatDescription)
            let areaA = Int(da.width) * Int(da.height)
            let areaB = Int(db.width) * Int(db.height)
            return abs(areaA - target) < abs(areaB - target)
        }
        guard let chosen = format else { return }

        let maxFps = chosen.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 30
        let fps = Int(min(maxFps, 30))
        capturer.startCapture(with: device, format: chosen, fps: fps)
    }
}

// MARK: - RTCPeerConnectionDelegate

extension RtcClient: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        listener.onLocalSignal([
            "kind": "candidate",
            "candidate": candidate.sdp,
            "sdpMid": candidate.sdpMid ?? "",
            "sdpMLineIndex": Int(candidate.sdpMLineIndex),
        ])
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver,
                        streams mediaStreams: [RTCMediaStream]) {
        if let track = rtpReceiver.track as? RTCVideoTrack {
            listener.onRemoteVideoTrack(track)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        listener.onConnectionStateChange(newState)
    }

    // Remaining required RTCPeerConnectionDelegate stubs (unused for 1:1).
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
