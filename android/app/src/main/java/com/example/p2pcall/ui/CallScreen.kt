package com.example.p2pcall.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.example.p2pcall.call.CallState
import com.example.p2pcall.call.CallStatus
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

@Composable
fun CallScreen(
    state: CallState,
    eglBase: EglBase,
    localTrack: VideoTrack?,
    remoteTrack: VideoTrack?,
    onToggleMic: () -> Unit,
    onToggleCamera: () -> Unit,
    onHangup: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(statusLabel(state.status), color = MaterialTheme.colorScheme.secondary)
            state.roomId?.let { Text("Room: $it") }
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.Black)) {
            if (remoteTrack != null) {
                VideoRenderer(
                    track = remoteTrack,
                    eglBase = eglBase,
                    mirror = false,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Text(
                    statusLabel(state.status),
                    color = Color.White,
                    modifier = Modifier.align(Alignment.Center),
                )
            }

            // Local preview thumbnail.
            if (localTrack != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(16.dp)
                        .width(110.dp)
                        .height(160.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.DarkGray),
                ) {
                    VideoRenderer(
                        track = localTrack,
                        eglBase = eglBase,
                        mirror = true,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Button(onClick = onToggleMic, modifier = Modifier.weight(1f)) {
                Text(if (state.micEnabled) "Mute" else "Unmute")
            }
            Button(onClick = onToggleCamera, modifier = Modifier.weight(1f)) {
                Text(if (state.cameraEnabled) "Cam off" else "Cam on")
            }
            Button(
                onClick = onHangup,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            ) { Text("End") }
        }
    }
}

/**
 * Bridges a WebRTC [VideoTrack] to a Compose UI via [SurfaceViewRenderer].
 * The renderer is initialized/released with the composition lifecycle and the
 * track sink is added/removed to avoid leaks.
 */
@Composable
private fun VideoRenderer(
    track: VideoTrack,
    eglBase: EglBase,
    mirror: Boolean,
    modifier: Modifier = Modifier,
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            SurfaceViewRenderer(context).apply {
                init(eglBase.eglBaseContext, null)
                setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                setMirror(mirror)
                setEnableHardwareScaler(true)
            }
        },
        update = { renderer -> track.addSink(renderer) },
        onRelease = { renderer ->
            track.removeSink(renderer)
            renderer.release()
        },
    )
}

private fun statusLabel(status: CallStatus): String = when (status) {
    CallStatus.IDLE -> ""
    CallStatus.CONNECTING -> "Connecting…"
    CallStatus.WAITING -> "Waiting for someone to join…"
    CallStatus.CONNECTED -> "Connected"
    CallStatus.RECONNECTING -> "Reconnecting…"
    CallStatus.ENDED -> "Call ended"
    CallStatus.ERROR -> "Error"
}
