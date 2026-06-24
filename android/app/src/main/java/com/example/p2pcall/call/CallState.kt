package com.example.p2pcall.call

/** High-level call status surfaced to the UI (mirrors the web client). */
enum class CallStatus {
    IDLE,
    CONNECTING,
    WAITING,
    CONNECTED,
    RECONNECTING,
    ENDED,
    ERROR,
}

/** Immutable UI state for the call screen. */
data class CallState(
    val status: CallStatus = CallStatus.IDLE,
    val roomId: String? = null,
    val error: String? = null,
    val micEnabled: Boolean = true,
    val cameraEnabled: Boolean = true,
    // --- AI features ---
    val aiAvailable: Boolean = false,
    val captionsEnabled: Boolean = false,
    /** Latest caption line shown as an overlay. */
    val caption: String = "",
    /** Target translation language label (e.g. "Spanish"), or null for off. */
    val captionLanguage: String? = null,
    /** Latest translated caption line, when translation is enabled. */
    val captionTranslation: String = "",
    val summarizing: Boolean = false,
    val summary: String? = null,
    val actionItems: List<String> = emptyList(),
)
