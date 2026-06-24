package com.example.p2pcall.webrtc

import android.content.Context
import android.util.Log
import org.json.JSONObject
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/**
 * WebRTC peer connection layer. Owns the PeerConnectionFactory, local
 * camera/mic tracks and a single RTCPeerConnection for a 1:1 call. Media flows
 * directly peer-to-peer; this class emits signaling via [Listener.onLocalSignal]
 * and never touches the socket.
 *
 * All WebRTC objects are created/disposed here so the ViewModel can guarantee
 * lifecycle-safe cleanup by calling [dispose].
 */
class RtcClient(
    context: Context,
    private val eglBase: EglBase,
    private val iceServers: List<PeerConnection.IceServer>,
    private val listener: Listener,
) {
    interface Listener {
        /** A signaling message to relay to the remote peer (offer/answer/candidate). */
        fun onLocalSignal(data: JSONObject)
        fun onRemoteVideoTrack(track: VideoTrack)
        fun onConnectionStateChange(state: PeerConnection.PeerConnectionState)
    }

    private val factory: PeerConnectionFactory
    private var peerConnection: PeerConnection? = null

    private var videoCapturer: VideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var surfaceHelper: SurfaceTextureHelper? = null
    private var localVideoTrackInternal: VideoTrack? = null
    private var localAudioTrack: AudioTrack? = null

    private var isInitiator = false

    val localVideoTrack: VideoTrack? get() = localVideoTrackInternal

    private val appContext = context.applicationContext

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext)
                .createInitializationOptions()
        )
        val encoder = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoder = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoder)
            .setVideoDecoderFactory(decoder)
            .createPeerConnectionFactory()
    }

    /** Acquire camera + mic and build local tracks. Call before [createPeerConnection]. */
    fun initLocalMedia() {
        val audioConstraints = MediaConstraints()
        val audioSource = factory.createAudioSource(audioConstraints)
        localAudioTrack = factory.createAudioTrack("audio0", audioSource)

        val capturer = createCameraCapturer() ?: run {
            Log.e(TAG, "No camera available")
            return
        }
        videoCapturer = capturer
        val source = factory.createVideoSource(capturer.isScreencast)
        videoSource = source
        surfaceHelper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
        capturer.initialize(surfaceHelper, appContext, source.capturerObserver)
        capturer.startCapture(1280, 720, 30)

        localVideoTrackInternal = factory.createVideoTrack("video0", source)
    }

    /** Create the peer connection and attach local tracks. */
    fun createPeerConnection(initiator: Boolean) {
        isInitiator = initiator
        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy =
                PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        peerConnection = factory.createPeerConnection(
            rtcConfig,
            object : PeerConnectionObserver() {
                override fun onIceCandidate(candidate: IceCandidate) {
                    listener.onLocalSignal(
                        JSONObject()
                            .put("kind", "candidate")
                            .put("candidate", candidate.sdp)
                            .put("sdpMid", candidate.sdpMid)
                            .put("sdpMLineIndex", candidate.sdpMLineIndex)
                    )
                }

                override fun onTrack(transceiver: org.webrtc.RtpTransceiver) {
                    val track = transceiver.receiver.track()
                    if (track is VideoTrack) listener.onRemoteVideoTrack(track)
                }

                override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                    listener.onConnectionStateChange(newState)
                }
            }
        )

        localVideoTrackInternal?.let { peerConnection?.addTrack(it, listOf(STREAM_ID)) }
        localAudioTrack?.let { peerConnection?.addTrack(it, listOf(STREAM_ID)) }

        // The initiator (newcomer) drives negotiation by creating the offer.
        if (isInitiator) createOffer()
    }

    private fun createOffer() {
        val pc = peerConnection ?: return
        pc.createOffer(object : SimpleSdpObserver() {
            override fun onCreateSuccess(desc: SessionDescription) {
                pc.setLocalDescription(SimpleSdpObserver(), desc)
                listener.onLocalSignal(
                    JSONObject().put("kind", "offer").put("sdp", desc.description)
                )
            }
        }, MediaConstraints())
    }

    /** Handle an incoming signaling message routed from the remote peer. */
    fun handleRemoteSignal(data: JSONObject) {
        val pc = peerConnection ?: return
        when (data.optString("kind")) {
            "offer" -> {
                val offer = SessionDescription(
                    SessionDescription.Type.OFFER,
                    data.optString("sdp")
                )
                pc.setRemoteDescription(object : SimpleSdpObserver() {
                    override fun onSetSuccess() {
                        pc.createAnswer(object : SimpleSdpObserver() {
                            override fun onCreateSuccess(desc: SessionDescription) {
                                pc.setLocalDescription(SimpleSdpObserver(), desc)
                                listener.onLocalSignal(
                                    JSONObject().put("kind", "answer")
                                        .put("sdp", desc.description)
                                )
                            }
                        }, MediaConstraints())
                    }
                }, offer)
            }

            "answer" -> {
                val answer = SessionDescription(
                    SessionDescription.Type.ANSWER,
                    data.optString("sdp")
                )
                pc.setRemoteDescription(SimpleSdpObserver(), answer)
            }

            "candidate" -> {
                val candidate = IceCandidate(
                    data.optString("sdpMid"),
                    data.optInt("sdpMLineIndex"),
                    data.optString("candidate")
                )
                pc.addIceCandidate(candidate)
            }
        }
    }

    fun setMicEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    fun setCameraEnabled(enabled: Boolean) {
        localVideoTrackInternal?.setEnabled(enabled)
    }

    /** Close the current peer connection but keep local media (for reconnect). */
    fun closePeerConnection() {
        peerConnection?.dispose()
        peerConnection = null
    }

    /** Full lifecycle-safe teardown of every WebRTC resource. */
    fun dispose() {
        try {
            peerConnection?.dispose()
            peerConnection = null

            videoCapturer?.stopCapture()
            videoCapturer?.dispose()
            videoCapturer = null

            videoSource?.dispose()
            videoSource = null

            surfaceHelper?.dispose()
            surfaceHelper = null

            localVideoTrackInternal?.dispose()
            localVideoTrackInternal = null
            localAudioTrack?.dispose()
            localAudioTrack = null

            factory.dispose()
        } catch (e: Exception) {
            Log.e(TAG, "Error during dispose", e)
        }
    }

    private fun createCameraCapturer(): VideoCapturer? {
        val enumerator = Camera2Enumerator(appContext)
        // Prefer the front camera for video calls.
        enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }?.let {
            return enumerator.createCapturer(it, null)
        }
        enumerator.deviceNames.firstOrNull()?.let {
            return enumerator.createCapturer(it, null)
        }
        return null
    }

    private companion object {
        const val TAG = "RtcClient"
        const val STREAM_ID = "local_stream"
    }
}

/** No-op SdpObserver base so callers override only what they need. */
private open class SimpleSdpObserver : SdpObserver {
    override fun onCreateSuccess(desc: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {
        Log.e("RtcClient", "createSDP failure: $error")
    }
    override fun onSetFailure(error: String?) {
        Log.e("RtcClient", "setSDP failure: $error")
    }
}
