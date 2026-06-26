import Foundation
import WebRTC

/// Environment-based configuration sourced from Info.plist (populated from the
/// build settings in `project.yml`). The iOS analogue of Android's
/// `Config` object backed by BuildConfig. See `ios/project.yml`.
enum Config {

    private static func value(_ key: String) -> String {
        let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String ?? ""
        return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static var signalingUrl: String { value("SIGNALING_URL") }

    /// Base URL of the FastAPI AI server (empty disables AI features).
    static var aiServerUrl: String { value("AI_SERVER_URL") }

    static var aiEnabled: Bool { !aiServerUrl.isEmpty }

    /// WebSocket URL for live captions, derived from `aiServerUrl`.
    static var aiCaptionsWsUrl: String {
        var base = aiServerUrl
        if base.hasPrefix("https://") {
            base = "wss://" + base.dropFirst("https://".count)
        } else if base.hasPrefix("http://") {
            base = "ws://" + base.dropFirst("http://".count)
        }
        return trimTrailingSlash(base) + "/ws/transcribe"
    }

    /// REST URL for end-of-call summaries.
    static var aiSummaryUrl: String { trimTrailingSlash(aiServerUrl) + "/summarize" }

    /// REST URL for meeting Q&A.
    static var aiAskUrl: String { trimTrailingSlash(aiServerUrl) + "/ask" }

    /// Builds the ICE server list: STUN by default, TURN only when configured.
    static func iceServers() -> [RTCIceServer] {
        var servers: [RTCIceServer] = []

        let stun = value("STUN_URLS")
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        if !stun.isEmpty {
            servers.append(RTCIceServer(urlStrings: stun))
        }

        let turnUrl = value("TURN_URL")
        let turnUser = value("TURN_USERNAME")
        let turnCred = value("TURN_CREDENTIAL")
        if !turnUrl.isEmpty && !turnUser.isEmpty && !turnCred.isEmpty {
            servers.append(
                RTCIceServer(urlStrings: [turnUrl], username: turnUser, credential: turnCred)
            )
        }
        return servers
    }

    private static func trimTrailingSlash(_ s: String) -> String {
        var out = s
        while out.hasSuffix("/") { out.removeLast() }
        return out
    }
}
