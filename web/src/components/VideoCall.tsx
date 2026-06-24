import { useEffect, useRef } from "react";
import { Controls } from "./Controls";
import type { CallState } from "../types";

interface VideoCallProps {
  state: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
}

const STATUS_LABEL: Record<CallState["status"], string> = {
  idle: "",
  connecting: "Connecting…",
  waiting: "Waiting for someone to join…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  ended: "Call ended",
  error: "Error",
};

/** In-call screen: remote video full-bleed, local preview as a thumbnail. */
export function VideoCall({
  state,
  localStream,
  remoteStream,
  onToggleMic,
  onToggleCamera,
  onHangup,
}: VideoCallProps) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  return (
    <div className="call">
      <div className="status-bar">
        <span className={`status status-${state.status}`}>
          {STATUS_LABEL[state.status]}
        </span>
        {state.roomId && <span className="room-id">Room: {state.roomId}</span>}
      </div>

      <div className="video-stage">
        <video
          ref={remoteRef}
          className="remote-video"
          autoPlay
          playsInline
        />
        {!remoteStream && (
          <div className="remote-placeholder">
            {STATUS_LABEL[state.status] || "Waiting…"}
          </div>
        )}
        <video
          ref={localRef}
          className="local-video"
          autoPlay
          playsInline
          muted
        />
      </div>

      <Controls
        micEnabled={state.micEnabled}
        cameraEnabled={state.cameraEnabled}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onHangup={onHangup}
      />
    </div>
  );
}
