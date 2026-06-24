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
)
