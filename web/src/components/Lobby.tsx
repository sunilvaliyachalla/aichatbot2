import { useState } from "react";

interface LobbyProps {
  onJoin: (roomId: string) => void;
  error: string | null;
  connecting: boolean;
}

/** Create/join screen. A room is created implicitly by joining its ID. */
export function Lobby({ onJoin, error, connecting }: LobbyProps) {
  const [roomId, setRoomId] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onJoin(roomId);
  };

  const generateId = () => {
    setRoomId(Math.random().toString(36).slice(2, 8));
  };

  return (
    <div className="lobby">
      <h1>P2P Video Call</h1>
      <p className="subtitle">
        Share a room ID with one other person to start a 1:1 call.
      </p>
      <form onSubmit={submit} className="lobby-form">
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Enter room ID"
          aria-label="Room ID"
          autoFocus
        />
        <div className="lobby-actions">
          <button type="button" className="btn-secondary" onClick={generateId}>
            Random ID
          </button>
          <button type="submit" className="btn-primary" disabled={connecting}>
            {connecting ? "Joining…" : "Join / Create"}
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
