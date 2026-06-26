import Foundation
import SocketIO

/// Signaling layer for iOS. Thin wrapper over the Socket.IO client that mirrors
/// the documented protocol (see repo README). Knows nothing about WebRTC; it
/// only relays messages and surfaces lifecycle events through closures, the
/// counterpart to Android's `SignalingClient`.
final class SignalingClient {

    struct Listener {
        var onConnected: () -> Void = {}
        var onDisconnected: () -> Void = {}
        var onReconnected: () -> Void = {}
        var onPeerJoined: (_ peerId: String) -> Void = { _ in }
        var onPeerLeft: (_ peerId: String) -> Void = { _ in }
        var onSignal: (_ from: String, _ data: [String: Any]) -> Void = { _, _ in }
    }

    private let url: String
    private let listener: Listener

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    /// First `connect` is a fresh join; subsequent ones are reconnects (mirrors
    /// the Android split between EVENT_CONNECT and the io "reconnect" event).
    private var hasConnectedOnce = false

    init(url: String, listener: Listener) {
        self.url = url
        self.listener = listener
    }

    func connect() {
        guard socket == nil, let parsed = URL(string: url) else { return }
        let mgr = SocketManager(socketURL: parsed, config: [
            .forceWebsockets(true),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(5),
            .compress,
        ])
        let s = mgr.defaultSocket

        s.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self = self else { return }
            if self.hasConnectedOnce {
                self.listener.onReconnected()
            } else {
                self.hasConnectedOnce = true
                self.listener.onConnected()
            }
        }
        s.on(clientEvent: .disconnect) { [weak self] _, _ in
            self?.listener.onDisconnected()
        }

        s.on("peer-joined") { [weak self] data, _ in
            guard let obj = data.first as? [String: Any],
                  let peerId = obj["peerId"] as? String else { return }
            self?.listener.onPeerJoined(peerId)
        }
        s.on("peer-left") { [weak self] data, _ in
            guard let obj = data.first as? [String: Any],
                  let peerId = obj["peerId"] as? String else { return }
            self?.listener.onPeerLeft(peerId)
        }
        s.on("signal") { [weak self] data, _ in
            guard let obj = data.first as? [String: Any],
                  let from = obj["from"] as? String,
                  let payload = obj["data"] as? [String: Any] else { return }
            self?.listener.onSignal(from, payload)
        }

        manager = mgr
        socket = s
        s.connect()
    }

    /// Join a room. The ack carries the existing peers (empty when first in).
    /// - Parameter onAck: invoked with (ok, peers, reason).
    func joinRoom(_ roomId: String,
                  onAck: @escaping (_ ok: Bool, _ peers: [String], _ reason: String?) -> Void) {
        socket?.emitWithAck("join-room", ["roomId": roomId]).timingOut(after: 10) { response in
            guard let obj = response.first as? [String: Any] else {
                onAck(false, [], "no-response")
                return
            }
            if (obj["ok"] as? Bool) == true {
                let peers = (obj["peers"] as? [Any])?.compactMap { $0 as? String } ?? []
                onAck(true, peers, nil)
            } else {
                onAck(false, [], (obj["reason"] as? String) ?? "unknown")
            }
        }
    }

    func sendSignal(to: String, data: [String: Any]) {
        socket?.emit("signal", ["to": to, "data": data])
    }

    func leaveRoom(_ roomId: String) {
        socket?.emit("leave-room", ["roomId": roomId])
    }

    func disconnect() {
        socket?.removeAllHandlers()
        socket?.disconnect()
        socket = nil
        manager = nil
        hasConnectedOnce = false
    }
}
