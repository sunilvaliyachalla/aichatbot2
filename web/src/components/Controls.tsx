interface ControlsProps {
  micEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
}

export function Controls({
  micEnabled,
  cameraEnabled,
  onToggleMic,
  onToggleCamera,
  onHangup,
}: ControlsProps) {
  return (
    <div className="controls">
      <button
        className={`control-btn ${micEnabled ? "" : "control-off"}`}
        onClick={onToggleMic}
        aria-pressed={!micEnabled}
      >
        {micEnabled ? "🎤 Mute" : "🔇 Unmute"}
      </button>
      <button
        className={`control-btn ${cameraEnabled ? "" : "control-off"}`}
        onClick={onToggleCamera}
        aria-pressed={!cameraEnabled}
      >
        {cameraEnabled ? "📹 Camera off" : "🚫 Camera on"}
      </button>
      <button className="control-btn control-hangup" onClick={onHangup}>
        📞 End
      </button>
    </div>
  );
}
