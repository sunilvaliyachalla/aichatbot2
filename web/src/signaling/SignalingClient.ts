import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  JoinRoomAck,
  ServerToClientEvents,
  SignalData,
} from "../types";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SignalingHandlers {
  onPeerJoined: (peerId: string) => void;
  onPeerLeft: (peerId: string) => void;
  onSignal: (from: string, data: SignalData) => void;
  onConnect: () => void;
  onDisconnect: (reason: string) => void;
  onReconnect: () => void;
}

/**
 * Signaling layer: thin, typed wrapper around Socket.IO. Knows nothing about
 * WebRTC — it only sends/receives signaling messages and connection lifecycle
 * events. Socket.IO handles reconnection automatically; we surface it via
 * handlers so the call layer can re-negotiate.
 */
export class SignalingClient {
  private socket: TypedSocket | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: SignalingHandlers
  ) {}

  get id(): string | undefined {
    return this.socket?.id;
  }

  connect(): void {
    if (this.socket) return;

    const socket: TypedSocket = io(this.url, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => this.handlers.onConnect());
    socket.on("disconnect", (reason) => this.handlers.onDisconnect(reason));
    socket.io.on("reconnect", () => this.handlers.onReconnect());

    socket.on("peer-joined", ({ peerId }) => this.handlers.onPeerJoined(peerId));
    socket.on("peer-left", ({ peerId }) => this.handlers.onPeerLeft(peerId));
    socket.on("signal", ({ from, data }) => this.handlers.onSignal(from, data));

    this.socket = socket;
  }

  /** Join a room. Resolves with the ack (existing peers or a failure reason). */
  joinRoom(roomId: string): Promise<JoinRoomAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Socket not connected"));
        return;
      }
      this.socket
        .timeout(10_000)
        .emit("join-room", { roomId }, (err: Error | null, ack: JoinRoomAck) => {
          if (err) reject(err);
          else resolve(ack);
        });
    });
  }

  sendSignal(to: string, data: SignalData): void {
    this.socket?.emit("signal", { to, data });
  }

  leaveRoom(roomId: string): void {
    this.socket?.emit("leave-room", { roomId });
  }

  /** Tear down the socket and all listeners. */
  disconnect(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.io.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }
}
