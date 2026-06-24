package com.example.p2pcall.ai

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import org.json.JSONObject

/**
 * WebSocket client for live captions. Streams raw PCM16 audio to the FastAPI
 * AI server (`/ws/transcribe`) and surfaces transcribed text. Pure transport —
 * audio capture lives in [AudioCaptioner].
 */
class AiCaptionClient(
    private val wsUrl: String,
    private val onCaption: (String) -> Unit,
    private val onError: (String) -> Unit = {},
) {
    private val httpClient = OkHttpClient()
    private var webSocket: WebSocket? = null

    fun connect() {
        if (webSocket != null) return
        val request = Request.Builder().url(wsUrl).build()
        webSocket = httpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching {
                    val obj = JSONObject(text)
                    when (obj.optString("type")) {
                        "final" -> obj.optString("text").takeIf { it.isNotBlank() }?.let(onCaption)
                        "error" -> onError(obj.optString("detail"))
                    }
                }.onFailure { Log.e(TAG, "bad caption message", it) }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onError(t.message ?: "captions websocket failed")
            }
        })
    }

    /** Send a chunk of raw mono PCM16 @ 16 kHz. */
    fun sendPcm(data: ByteArray, length: Int) {
        webSocket?.send(data.copyOf(length).toByteString())
    }

    /** Ask the server to transcribe everything buffered since the last flush. */
    fun flush() {
        webSocket?.send("flush")
    }

    fun close() {
        webSocket?.send("close")
        webSocket?.close(1000, null)
        webSocket = null
    }

    private companion object {
        const val TAG = "AiCaptionClient"
    }
}
