import Foundation
import AVFoundation

/// Captures microphone audio as 16 kHz mono PCM16 and streams it to an
/// `AiCaptionClient`, flushing every `flushIntervalMs` to get incremental
/// captions. Mirrors Android's `AudioCaptioner`.
///
/// Note: this opens its own `AVAudioEngine` tap on the mic. On some devices the
/// OS does not allow a second capture while WebRTC owns the audio session; in
/// that case prefer tapping WebRTC's audio samples. Captions are opt-in so this
/// only runs on demand.
final class AudioCaptioner {

    private let client: AiCaptionClient
    private let flushInterval: TimeInterval

    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?
    private let outputFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: 16_000,
        channels: 1,
        interleaved: true
    )!
    private var lastFlush = Date()
    private var running = false

    init(client: AiCaptionClient, flushIntervalMs: Int = 3000) {
        self.client = client
        self.flushInterval = TimeInterval(flushIntervalMs) / 1000.0
    }

    /// - Throws: rethrows `AVAudioEngine.start()` / audio-session errors so the
    ///   caller can surface a "microphone required" message.
    func start() throws {
        guard !running else { return }
        running = true
        client.connect()

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)

        let input = engine.inputNode
        let inputFormat = input.inputFormat(forBus: 0)
        converter = AVAudioConverter(from: inputFormat, to: outputFormat)
        lastFlush = Date()

        input.installTap(onBus: 0, bufferSize: 2048, format: inputFormat) { [weak self] buffer, _ in
            self?.process(buffer)
        }
        engine.prepare()
        try engine.start()
    }

    private func process(_ buffer: AVAudioPCMBuffer) {
        guard running, let converter = converter else { return }

        let ratio = outputFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
        guard let out = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return }

        var fed = false
        var error: NSError?
        converter.convert(to: out, error: &error) { _, status in
            if fed {
                status.pointee = .noDataNow
                return nil
            }
            fed = true
            status.pointee = .haveData
            return buffer
        }
        if error != nil { return }

        if let channels = out.int16ChannelData, out.frameLength > 0 {
            let byteCount = Int(out.frameLength) * MemoryLayout<Int16>.size
            let data = Data(bytes: channels[0], count: byteCount)
            client.sendPcm(data)
        }

        let now = Date()
        if now.timeIntervalSince(lastFlush) >= flushInterval {
            client.flush()
            lastFlush = now
        }
    }

    func stop() {
        guard running else { return }
        running = false
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        converter = nil
        client.flush() // final flush on stop
        client.close()
    }
}
