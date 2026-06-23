/** Signaling payload exchanged between two peers (mirrors the server). */
export type SignalData =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | {
      kind: "candidate";
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
    };

export type JoinRoomAck =
  | { ok: true; selfId: string; peers: string[] }
  | { ok: false; reason: "room-full" | "invalid-room" };

export interface ServerToClientEvents {
  "peer-joined": (payload: { peerId: string }) => void;
  "peer-left": (payload: { peerId: string }) => void;
  signal: (payload: { from: string; data: SignalData }) => void;
}

export interface ClientToServerEvents {
  "join-room": (
    payload: { roomId: string },
    ack: (response: JoinRoomAck) => void
  ) => void;
  signal: (payload: { to: string; data: SignalData }) => void;
  "leave-room": (payload: { roomId: string }) => void;
}

/** High-level call state surfaced to the UI. */
export type CallStatus =
  | "idle"
  | "connecting" // joining room / negotiating
  | "waiting" // in room, waiting for a peer
  | "connected" // media flowing
  | "reconnecting"
  | "ended"
  | "error";

export interface CallState {
  status: CallStatus;
  roomId: string | null;
  error: string | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
}
