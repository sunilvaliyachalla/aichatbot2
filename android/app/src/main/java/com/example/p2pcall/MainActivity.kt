package com.example.p2pcall

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.p2pcall.call.CallStatus
import com.example.p2pcall.call.CallViewModel
import com.example.p2pcall.ui.CallScreen
import com.example.p2pcall.ui.LobbyScreen
import com.example.p2pcall.ui.theme.P2PCallTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            P2PCallTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AppRoot()
                }
            }
        }
    }
}

@Composable
private fun AppRoot(vm: CallViewModel = viewModel()) {
    val state by vm.state.collectAsState()
    val localTrack by vm.localTrack.collectAsState()
    val remoteTrack by vm.remoteTrack.collectAsState()

    var permissionsGranted by remember { mutableStateOf(false) }
    var pendingRoom by remember { mutableStateOf<String?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val granted = result[Manifest.permission.CAMERA] == true &&
            result[Manifest.permission.RECORD_AUDIO] == true
        permissionsGranted = granted
        if (granted) pendingRoom?.let { vm.join(it) }
        pendingRoom = null
    }

    val inCall = state.status in setOf(
        CallStatus.CONNECTING,
        CallStatus.WAITING,
        CallStatus.CONNECTED,
        CallStatus.RECONNECTING,
    )

    when {
        inCall -> CallScreen(
            state = state,
            eglBase = vm.eglBase,
            localTrack = localTrack,
            remoteTrack = remoteTrack,
            onToggleMic = vm::toggleMic,
            onToggleCamera = vm::toggleCamera,
            onHangup = vm::hangup,
            onToggleCaptions = vm::toggleCaptions,
            onCycleLanguage = vm::cycleCaptionLanguage,
            onSummarize = vm::requestSummary,
            onDismissSummary = vm::dismissSummary,
            onAsk = vm::ask,
            onDismissAnswer = vm::dismissAnswer,
        )

        else -> LobbyScreen(
            error = state.error,
            onJoin = { room ->
                if (permissionsGranted) {
                    vm.join(room)
                } else {
                    pendingRoom = room
                    permissionLauncher.launch(
                        arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
                    )
                }
            },
        )
    }
}
