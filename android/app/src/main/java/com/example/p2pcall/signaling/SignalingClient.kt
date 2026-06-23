package com.example.p2pcall.signaling

import android.util.Log
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

/**
 * Signaling layer for Android. Thin wrapper over the Socket.IO client that
 * mirrors the documented protocol. Knows nothing about WebRTC; it only relays
 * messages and surfaces lifecycle events through [Listener].
 */
class SignalingClient(
    private val url: String,
    private val listener: Listener,
) {
    interface Listener {
        fun onConnected()
        fun onDisconnected()
        fun onReconnected()
        fun onPeerJoined(peerId: String)
        fun onPeerLeft(peerId: String)
        fun onSignal(from: String, data: JSONObject)
    }

    private var socket: Socket? = null

    val id: String? get() = socket?.id()

    fun connect() {
        if (socket != null) return
        val opts = IO.Options().apply {
            transports = arrayOf("websocket")
            reconnection = true
            reconnectionDelay = 1000
            reconnectionDelayMax = 5000
        }
        val s = IO.socket(url, opts)

        s.on(Socket.EVENT_CONNECT) { listener.onConnected() }
        s.on(Socket.EVENT_DISCONNECT) { listener.onDisconnected() }
        s.io().on("reconnect") { listener.onReconnected() }

        s.on("peer-joined") { args ->
            (args.firstOrNull() as? JSONObject)?.let {
                listener.onPeerJoined(it.optString("peerId"))
            }
        }
        s.on("peer-left") { args ->
            (args.firstOrNull() as? JSONObject)?.let {
                listener.onPeerLeft(it.optString("peerId"))
            }
        }
        s.on("signal") { args ->
            (args.firstOrNull() as? JSONObject)?.let {
                val from = it.optString("from")
                val data = it.optJSONObject("data") ?: return@let
                listener.onSignal(from, data)
            }
        }

        socket = s
        s.connect()
    }

    /**
     * Join a room. The ack carries the existing peers (empty when first in).
     * @param onAck invoked with (ok, peers, reason)
     */
    fun joinRoom(roomId: String, onAck: (ok: Boolean, peers: List<String>, reason: String?) -> Unit) {
        val payload = JSONObject().put("roomId", roomId)
        socket?.emit("join-room", arrayOf(payload), Ack { response ->
            val obj = response.firstOrNull() as? JSONObject
            if (obj == null) {
                onAck(false, emptyList(), "no-response")
                return@Ack
            }
            if (obj.optBoolean("ok", false)) {
                val arr = obj.optJSONArray("peers")
                val peers = buildList {
                    if (arr != null) for (i in 0 until arr.length()) add(arr.getString(i))
                }
                onAck(true, peers, null)
            } else {
                onAck(false, emptyList(), obj.optString("reason", "unknown"))
            }
        })
    }

    fun sendSignal(to: String, data: JSONObject) {
        val payload = JSONObject().put("to", to).put("data", data)
        socket?.emit("signal", payload)
    }

    fun leaveRoom(roomId: String) {
        socket?.emit("leave-room", JSONObject().put("roomId", roomId))
    }

    fun disconnect() {
        socket?.let {
            it.off()
            it.io().off()
            it.disconnect()
            it.close()
        }
        socket = null
        Log.d(TAG, "Signaling disconnected")
    }

    private companion object {
        const val TAG = "SignalingClient"
    }
}
