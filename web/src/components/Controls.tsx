interface ControlsProps {
  micEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
  // --- Optional AI controls (rendered only when aiAvailable) ---
  aiAvailable?: boolean;
  captionsEnabled?: boolean;
  captionLanguage?: string | null;
  summarizing?: boolean;
  onToggleCaptions?: () => void;
  onCycleLanguage?: () => void;
  onSummarize?: () => void;
}

export function Controls({
  micEnabled,
  cameraEnabled,
  onToggleMic,
  onToggleCamera,
  onHangup,
  aiAvailable = false,
  captionsEnabled = false,
  captionLanguage = null,
  summarizing = false,
  onToggleCaptions,
  onCycleLanguage,
  onSummarize,
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

      {aiAvailable && (
        <>
          <button
            className={`control-btn ${captionsEnabled ? "control-on" : ""}`}
            onClick={onToggleCaptions}
            aria-pressed={captionsEnabled}
          >
            {captionsEnabled ? "💬 Captions on" : "💬 Captions"}
          </button>
          <button
            className="control-btn"
            onClick={onCycleLanguage}
            disabled={!captionsEnabled}
            title="Cycle live-translation language"
          >
            🌐 {captionLanguage ?? "Off"}
          </button>
          <button
            className="control-btn"
            onClick={onSummarize}
            disabled={summarizing}
          >
            {summarizing ? "⏳ Summarizing…" : "📝 Summary"}
          </button>
        </>
      )}

      <button className="control-btn control-hangup" onClick={onHangup}>
        📞 End
      </button>
    </div>
  );
}
