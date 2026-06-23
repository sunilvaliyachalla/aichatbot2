import http from "node:http";
import express from "express";
import cors from "cors";
import { Server, type Socket } from "socket.io";

import { RoomRegistry } from "./rooms.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types.js";

export interface SignalingServerOptions {
  corsOrigin: string | string[];
  maxPeersPerRoom: number;
}

export interface SignalingServer {
  app: express.Express;
  httpServer: http.Server;
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  rooms: RoomRegistry;
}

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export function isValidRoomId(roomId: unknown): roomId is string {
  return (
    typeof roomId === "string" &&
    roomId.trim().length > 0 &&
    roomId.length <= 128
  );
}

/**
 * Builds the signaling server (Express + Socket.IO) and wires the relay-only
 * protocol. Does NOT start listening — call `.httpServer.listen()` (production)
 * or pass to tests on an ephemeral port. Keeping construction separate from
 * listening makes the server straightforward to integration-test.
 */
export function createSignalingServer(options: SignalingServerOptions): SignalingServer {
  const rooms = new RoomRegistry();

  const app = express();
  app.use(cors({ origin: options.corsOrigin }));
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", rooms: rooms.roomCount() });
  });

  const httpServer = http.createServer(app);
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: { origin: options.corsOrigin, methods: ["GET", "POST"] },
  });

  function leaveRoom(socket: TypedSocket, roomId: string): void {
    const wasMember = rooms.remove(roomId, socket.id);
    if (!wasMember) return;
    void socket.leave(roomId);
    socket.to(roomId).emit("peer-left", { peerId: socket.id });
    if (socket.data.roomId === roomId) socket.data.roomId = undefined;
  }

  io.on("connection", (socket) => {
    socket.on("join-room", ({ roomId }, ack) => {
      if (!isValidRoomId(roomId)) {
        ack?.({ ok: false, reason: "invalid-room" });
        return;
      }
      if (rooms.size(roomId) >= options.maxPeersPerRoom) {
        ack?.({ ok: false, reason: "room-full" });
        return;
      }
      if (socket.data.roomId && socket.data.roomId !== roomId) {
        leaveRoom(socket, socket.data.roomId);
      }

      const existingPeers = rooms.add(roomId, socket.id);
      socket.data.roomId = roomId;
      void socket.join(roomId);

      // Existing peers learn of the newcomer (the newcomer is the initiator).
      socket.to(roomId).emit("peer-joined", { peerId: socket.id });
      ack?.({ ok: true, selfId: socket.id, peers: existingPeers });
    });

    // Relay-only: route a signaling message to a single target peer.
    socket.on("signal", ({ to, data }) => {
      if (typeof to !== "string" || !data) return;
      io.to(to).emit("signal", { from: socket.id, data });
    });

    socket.on("leave-room", ({ roomId }) => {
      if (isValidRoomId(roomId)) leaveRoom(socket, roomId);
    });

    socket.on("disconnect", () => {
      if (socket.data.roomId) leaveRoom(socket, socket.data.roomId);
    });
  });

  return { app, httpServer, io, rooms };
}
