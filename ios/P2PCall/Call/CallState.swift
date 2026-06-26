import Foundation

/// High-level call status surfaced to the UI (mirrors the Android/web clients).
enum CallStatus {
    case idle
    case connecting
    case waiting
    case connected
    case reconnecting
    case ended
    case error
}

/// Immutable UI state for the call screen (value type, mirrors Android's
/// `data class CallState`).
struct CallState {
    var status: CallStatus = .idle
    var roomId: String? = nil
    var error: String? = nil
    var micEnabled: Bool = true
    var cameraEnabled: Bool = true

    // --- AI features ---
    var aiAvailable: Bool = false
    var captionsEnabled: Bool = false
    /// Latest caption line shown as an overlay.
    var caption: String = ""
    /// Target translation language label (e.g. "Spanish"), or nil for off.
    var captionLanguage: String? = nil
    /// Latest translated caption line, when translation is enabled.
    var captionTranslation: String = ""
    var summarizing: Bool = false
    var summary: String? = nil
    var actionItems: [String] = []

    // Meeting Q&A
    var asking: Bool = false
    var answer: String? = nil
}

extension CallStatus {
    /// Human-readable label, mirroring the Android `statusLabel` helper.
    var label: String {
        switch self {
        case .idle: return ""
        case .connecting: return "Connecting…"
        case .waiting: return "Waiting for someone to join…"
        case .connected: return "Connected"
        case .reconnecting: return "Reconnecting…"
        case .ended: return "Call ended"
        case .error: return "Error"
        }
    }
}
