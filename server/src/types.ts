/**
 * Shared signaling types. These mirror the protocol documented in the README
 * and are kept intentionally small: the server only relays messages.
 */

/** A single SDP/ICE payload exchanged between two peers. */
export type SignalData =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | {
      kind: "candidate";
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
    };

/* ---- Client -> Server events ---- */

export interface JoinRoomPayload {
  roomId: string;
}

/** Relay a signaling message to a specific peer in the same room. */
export interface SignalPayload {
  to: string;
  data: SignalData;
}

export interface LeaveRoomPayload {
  roomId: string;
}

/** Ack returned to the joining socket. */
export type JoinRoomAck =
  | { ok: true; selfId: string; peers: string[] }
  | { ok: false; reason: "room-full" | "invalid-room" };

/* ---- Server -> Client events ---- */

export interface PeerJoinedPayload {
  peerId: string;
}

export interface PeerLeftPayload {
  peerId: string;
}

export interface IncomingSignalPayload {
  from: string;
  data: SignalData;
}

/** Strongly typed Socket.IO event maps. */
export interface ClientToServerEvents {
  "join-room": (
    payload: JoinRoomPayload,
    ack: (response: JoinRoomAck) => void
  ) => void;
  signal: (payload: SignalPayload) => void;
  "leave-room": (payload: LeaveRoomPayload) => void;
}

export interface ServerToClientEvents {
  "peer-joined": (payload: PeerJoinedPayload) => void;
  "peer-left": (payload: PeerLeftPayload) => void;
  signal: (payload: IncomingSignalPayload) => void;
}

export interface SocketData {
  /** The room this socket currently belongs to, if any. */
  roomId?: string;
}
