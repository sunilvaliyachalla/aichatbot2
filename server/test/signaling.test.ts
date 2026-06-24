import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import { createSignalingServer, type SignalingServer } from "../src/server.js";

let server: SignalingServer;
let url: string;
const clients: Socket[] = [];

beforeAll(async () => {
  server = createSignalingServer({ corsOrigin: "*", maxPeersPerRoom: 2 });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  url = `http://localhost:${port}`;
});

afterAll(async () => {
  server.io.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
});

afterEach(() => {
  for (const c of clients.splice(0)) c.disconnect();
});

/** Connect a fresh client and resolve once it has a socket id. */
function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, { transports: ["websocket"], forceNew: true });
    clients.push(socket);
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

/** Join a room and resolve with the server ack. */
function join(
  socket: Socket,
  roomId: string
): Promise<{ ok: boolean; peers?: string[]; reason?: string }> {
  return new Promise((resolve) => {
    socket.emit("join-room", { roomId }, resolve);
  });
}

/** Resolve with the first payload for `event`, or reject on timeout. */
function once<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe("signaling server (functional)", () => {
  it("first peer joins alone, second peer sees the first", async () => {
    const a = await connect();
    const ackA = await join(a, "room-a");
    expect(ackA.ok).toBe(true);
    expect(ackA.peers).toEqual([]);

    const peerJoined = once<{ peerId: string }>(a, "peer-joined");
    const b = await connect();
    const ackB = await join(b, "room-a");

    expect(ackB.ok).toBe(true);
    expect(ackB.peers).toEqual([a.id]);
    expect((await peerJoined).peerId).toBe(b.id);
  });

  it("relays a signaling message to the targeted peer only", async () => {
    const a = await connect();
    const b = await connect();
    await join(a, "room-sig");
    await join(b, "room-sig");

    const received = once<{ from: string; data: unknown }>(b, "signal");
    a.emit("signal", { to: b.id, data: { kind: "offer", sdp: "v=0..." } });

    const msg = await received;
    expect(msg.from).toBe(a.id);
    expect(msg.data).toEqual({ kind: "offer", sdp: "v=0..." });
  });

  it("rejects a third peer with room-full", async () => {
    const a = await connect();
    const b = await connect();
    await join(a, "room-full-test");
    await join(b, "room-full-test");

    const c = await connect();
    const ackC = await join(c, "room-full-test");
    expect(ackC.ok).toBe(false);
    expect(ackC.reason).toBe("room-full");
  });

  it("notifies remaining peers when one disconnects", async () => {
    const a = await connect();
    const b = await connect();
    await join(a, "room-leave");
    await join(b, "room-leave");

    const peerLeft = once<{ peerId: string }>(a, "peer-left");
    const bId = b.id;
    b.disconnect();

    expect((await peerLeft).peerId).toBe(bId);
  });

  it("rejects an invalid (empty) room id", async () => {
    const a = await connect();
    const ack = await join(a, "");
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe("invalid-room");
  });
});
