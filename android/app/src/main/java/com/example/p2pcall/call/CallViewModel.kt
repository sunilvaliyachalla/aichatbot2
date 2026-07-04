package com.example.p2pcall.call

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.p2pcall.ai.AiCaptionClient
import com.example.p2pcall.ai.AiQaClient
import com.example.p2pcall.ai.AiSummaryClient
import com.example.p2pcall.ai.AudioCaptioner
import com.example.p2pcall.config.Config
import com.example.p2pcall.config.Prefs
import com.example.p2pcall.signaling.SignalingClient
import com.example.p2pcall.webrtc.RtcClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.webrtc.EglBase
import org.webrtc.PeerConnection
import org.webrtc.VideoTrack

/**
 * Room/session state management for Android. Wires the signaling client to the
 * WebRTC client for a 1:1 call and exposes immutable [CallState] plus the local
 * and remote video tracks for rendering. All teardown happens in [cleanup] /
 * [onCleared] so resources are released with the ViewModel lifecycle.
 */
class CallViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(CallState(aiAvailable = Config.aiEnabled))
    val state: StateFlow<CallState> = _state.asStateFlow()

    private val _localTrack = MutableStateFlow<VideoTrack?>(null)
    val localTrack: StateFlow<VideoTrack?> = _localTrack.asStateFlow()

    private val _remoteTrack = MutableStateFlow<VideoTrack?>(null)
    val remoteTrack: StateFlow<VideoTrack?> = _remoteTrack.asStateFlow()

    val eglBase: EglBase = EglBase.create()

    private val prefs = Prefs(app)

    /** Current signaling server URL (persisted override or build-time default). */
    val serverUrl: String get() = prefs.signalingUrl

    private var signaling: SignalingClient? = null
    private var rtc: RtcClient? = null
    private var remotePeerId: String? = null
    private var roomId: String? = null

    // AI captions/summary
    private var captioner: AudioCaptioner? = null
    private var captionClient: AiCaptionClient? = null
    private val transcript = StringBuilder()

    /**
     * Join a room. [serverUrl] overrides the signaling server for this and
     * future sessions (persisted); pass blank to keep the current one. This
     * lets the lobby screen point the app at any private IP / LAN host / URL
     * without rebuilding.
     */
    fun join(room: String, serverUrl: String = "") {
        val trimmed = room.trim()
        if (trimmed.isEmpty()) {
            update { it.copy(status = CallStatus.ERROR, error = "Please enter a room ID.") }
            return
        }

        val url = serverUrl.trim().ifEmpty { prefs.signalingUrl }
        if (url.isEmpty()) {
            update { it.copy(status = CallStatus.ERROR, error = "Please enter a server URL.") }
            return
        }
        // Persist so the chosen server sticks across restarts.
        prefs.signalingUrl = url

        roomId = trimmed
        update { it.copy(status = CallStatus.CONNECTING, roomId = trimmed, error = null) }

        val client = RtcClient(
            context = getApplication(),
            eglBase = eglBase,
            iceServers = Config.iceServers(),
            listener = rtcListener,
        )
        client.initLocalMedia()
        _localTrack.value = client.localVideoTrack
        rtc = client

        val signalingClient = SignalingClient(url, signalingListener)
        signaling = signalingClient
        signalingClient.connect()
    }

    private val signalingListener = object : SignalingClient.Listener {
        override fun onConnected() {
            val room = roomId ?: return
            signaling?.joinRoom(room) { ok, peers, reason ->
                if (!ok) {
                    update {
                        it.copy(
                            status = CallStatus.ERROR,
                            error = if (reason == "room-full") "Room is full (1:1 only)."
                            else "Could not join room."
                        )
                    }
                    return@joinRoom
                }
                if (peers.isNotEmpty()) {
                    // Existing peer present -> we are the initiator.
                    remotePeerId = peers.first()
                    rtc?.createPeerConnection(initiator = true)
                } else {
                    update { it.copy(status = CallStatus.WAITING) }
                }
            }
        }

        override fun onDisconnected() {
            update { it.copy(status = CallStatus.RECONNECTING) }
        }

        override fun onReconnected() {
            // Re-join after a transport reconnect; rebuild the peer connection.
            val room = roomId ?: return
            rtc?.closePeerConnection()
            _remoteTrack.value = null
            signaling?.joinRoom(room) { ok, peers, _ ->
                if (ok && peers.isNotEmpty()) {
                    remotePeerId = peers.first()
                    rtc?.createPeerConnection(initiator = true)
                } else {
                    update { it.copy(status = CallStatus.WAITING) }
                }
            }
        }

        override fun onPeerJoined(peerId: String) {
            // Newcomer is the initiator; we wait for their offer.
            remotePeerId = peerId
            rtc?.createPeerConnection(initiator = false)
        }

        override fun onPeerLeft(peerId: String) {
            if (peerId == remotePeerId) {
                rtc?.closePeerConnection()
                remotePeerId = null
                _remoteTrack.value = null
                update { it.copy(status = CallStatus.WAITING) }
            }
        }

        override fun onSignal(from: String, data: JSONObject) {
            if (remotePeerId == null) {
                remotePeerId = from
                rtc?.createPeerConnection(initiator = false)
            }
            rtc?.handleRemoteSignal(data)
        }
    }

    private val rtcListener = object : RtcClient.Listener {
        override fun onLocalSignal(data: JSONObject) {
            val to = remotePeerId ?: return
            signaling?.sendSignal(to, data)
        }

        override fun onRemoteVideoTrack(track: VideoTrack) {
            _remoteTrack.value = track
            update { it.copy(status = CallStatus.CONNECTED) }
        }

        override fun onConnectionStateChange(state: PeerConnection.PeerConnectionState) {
            viewModelScope.launch {
                when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED ->
                        update { it.copy(status = CallStatus.CONNECTED) }
                    PeerConnection.PeerConnectionState.DISCONNECTED,
                    PeerConnection.PeerConnectionState.FAILED ->
                        update { it.copy(status = CallStatus.RECONNECTING) }
                    else -> Unit
                }
            }
        }
    }

    fun toggleMic() {
        val enabled = !_state.value.micEnabled
        rtc?.setMicEnabled(enabled)
        update { it.copy(micEnabled = enabled) }
    }

    fun toggleCamera() {
        val enabled = !_state.value.cameraEnabled
        rtc?.setCameraEnabled(enabled)
        update { it.copy(cameraEnabled = enabled) }
    }

    /**
     * Toggle live AI captions. Requires RECORD_AUDIO (already granted before
     * joining) and a configured AI server. Opt-in by design.
     */
    fun toggleCaptions() {
        if (!Config.aiEnabled) return
        val enabling = !_state.value.captionsEnabled
        if (enabling) {
            val client = AiCaptionClient(
                wsUrl = Config.aiCaptionsWsUrl,
                onCaption = { line, translation ->
                    transcript.append(line).append('\n')
                    update {
                        it.copy(caption = line, captionTranslation = translation ?: "")
                    }
                },
                onError = { msg -> Log.w("CallViewModel", "captions: $msg") },
            )
            captionClient = client
            val cap = AudioCaptioner(client)
            captioner = cap
            try {
                cap.start()
                // Re-apply any previously chosen translation language.
                client.setLanguage(_state.value.captionLanguage)
                update { it.copy(captionsEnabled = true) }
            } catch (e: SecurityException) {
                update { it.copy(error = "Microphone permission required for captions.") }
            }
        } else {
            captioner?.stop()
            captioner = null
            captionClient = null
            update { it.copy(captionsEnabled = false, caption = "", captionTranslation = "") }
        }
    }

    /** Cycle the live-translation target language: Off → Spanish → French → Hindi → Off. */
    fun cycleCaptionLanguage() {
        if (!Config.aiEnabled) return
        val order = listOf(null, "Spanish", "French", "Hindi")
        val current = order.indexOf(_state.value.captionLanguage)
        val next = order[(current + 1) % order.size]
        captionClient?.setLanguage(next)
        update { it.copy(captionLanguage = next, captionTranslation = "") }
    }

    /** Summarize the accumulated transcript via the FastAPI/Ollama backend. */
    fun requestSummary() {
        if (!Config.aiEnabled || transcript.isBlank()) return
        val text = transcript.toString()
        update { it.copy(summarizing = true, error = null) }
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    AiSummaryClient(Config.aiSummaryUrl).summarize(text)
                }
                update {
                    it.copy(
                        summarizing = false,
                        summary = result.summary,
                        actionItems = result.actionItems,
                    )
                }
            } catch (e: Exception) {
                update { it.copy(summarizing = false, error = "Summary failed: ${e.message}") }
            }
        }
    }

    fun dismissSummary() {
        update { it.copy(summary = null, actionItems = emptyList()) }
    }

    /** Ask a question grounded in the live transcript (FastAPI/Ollama /ask). */
    fun ask(question: String) {
        if (!Config.aiEnabled || question.isBlank() || transcript.isBlank()) return
        val text = transcript.toString()
        update { it.copy(asking = true, error = null) }
        viewModelScope.launch {
            try {
                val answer = withContext(Dispatchers.IO) {
                    AiQaClient(Config.aiAskUrl).ask(text, question)
                }
                update { it.copy(asking = false, answer = answer) }
            } catch (e: Exception) {
                update { it.copy(asking = false, error = "Ask failed: ${e.message}") }
            }
        }
    }

    fun dismissAnswer() {
        update { it.copy(answer = null) }
    }

    fun hangup() {
        cleanup()
        update { CallState(status = CallStatus.ENDED, aiAvailable = Config.aiEnabled) }
    }

    private fun cleanup() {
        captioner?.stop()
        captioner = null
        captionClient = null
        transcript.setLength(0)
        roomId?.let { signaling?.leaveRoom(it) }
        signaling?.disconnect()
        signaling = null
        rtc?.dispose()
        rtc = null
        remotePeerId = null
        roomId = null
        _localTrack.value = null
        _remoteTrack.value = null
    }

    private fun update(transform: (CallState) -> CallState) {
        _state.value = transform(_state.value)
    }

    override fun onCleared() {
        super.onCleared()
        try {
            cleanup()
            eglBase.release()
        } catch (e: Exception) {
            Log.e("CallViewModel", "Error in onCleared", e)
        }
    }
}
