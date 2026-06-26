import Foundation

/// WebSocket client for live captions. Streams raw PCM16 audio to the FastAPI
/// AI server (`/ws/transcribe`) and surfaces transcribed text. Pure transport —
/// audio capture lives in `AudioCaptioner`. Mirrors Android's `AiCaptionClient`.
final class AiCaptionClient {

    private let wsUrl: String
    /// Called with the recognized text and an optional translation.
    private let onCaption: (_ text: String, _ translation: String?) -> Void
    private let onError: (String) -> Void

    private let session = URLSession(configuration: .default)
    private var task: URLSessionWebSocketTask?
    private var pendingLang: String?

    init(wsUrl: String,
         onCaption: @escaping (_ text: String, _ translation: String?) -> Void,
         onError: @escaping (String) -> Void = { _ in }) {
        self.wsUrl = wsUrl
        self.onCaption = onCaption
        self.onError = onError
    }

    func connect() {
        guard task == nil, let url = URL(string: wsUrl) else { return }
        let t = session.webSocketTask(with: url)
        task = t
        t.resume()
        // Apply any language selected before the socket was open.
        if let lang = pendingLang { send(text: "lang:\(lang)") }
        receiveLoop()
    }

    private func receiveLoop() {
        task?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let message):
                if case .string(let text) = message { self.handle(text) }
                self.receiveLoop()
            case .failure(let error):
                self.onError(error.localizedDescription)
            }
        }
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        switch obj["type"] as? String {
        case "final":
            let caption = (obj["text"] as? String) ?? ""
            if !caption.isEmpty {
                let translationRaw = obj["translation"] as? String
                let translation = (translationRaw?.isEmpty == false) ? translationRaw : nil
                onCaption(caption, translation)
            }
        case "error":
            onError((obj["detail"] as? String) ?? "caption error")
        default:
            break
        }
    }

    /// Enable live translation into `lang` (a name or code), or nil to disable.
    func setLanguage(_ lang: String?) {
        pendingLang = lang
        send(text: "lang:\(lang ?? "off")")
    }

    /// Send a chunk of raw mono PCM16 @ 16 kHz.
    func sendPcm(_ data: Data) {
        task?.send(.data(data)) { _ in }
    }

    /// Ask the server to transcribe everything buffered since the last flush.
    func flush() {
        send(text: "flush")
    }

    func close() {
        send(text: "close")
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
    }

    private func send(text: String) {
        task?.send(.string(text)) { _ in }
    }
}
