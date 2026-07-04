import { useEffect, useRef, useState } from "react";
import { Controls } from "./Controls";
import type { CallState } from "../types";

interface VideoCallProps {
  state: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
  // AI features (optional; active only when state.aiAvailable).
  onToggleCaptions?: () => void;
  onCycleLanguage?: () => void;
  onSummarize?: () => void;
  onDismissSummary?: () => void;
  onAsk?: (question: string) => void;
  onDismissAnswer?: () => void;
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
  onToggleCaptions,
  onCycleLanguage,
  onSummarize,
  onDismissSummary,
  onAsk,
  onDismissAnswer,
}: VideoCallProps) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [question, setQuestion] = useState("");

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const submitQuestion = () => {
    const q = question.trim();
    if (!q) return;
    onAsk?.(q);
    setQuestion("");
  };

  return (
    <div className="call">
      <div className="status-bar">
        <span className={`status status-${state.status}`}>
          {STATUS_LABEL[state.status]}
        </span>
        {state.roomId && <span className="room-id">Room: {state.roomId}</span>}
      </div>

      <div className="video-stage">
        <video ref={remoteRef} className="remote-video" autoPlay playsInline />
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

        {/* Live caption overlay */}
        {state.captionsEnabled && state.caption && (
          <div className="caption-overlay" role="status" aria-live="polite">
            <div className="caption-text">{state.caption}</div>
            {state.captionTranslation && (
              <div className="caption-translation">{state.captionTranslation}</div>
            )}
          </div>
        )}
      </div>

      {/* In-call error banner (e.g. AI request failures) */}
      {state.error && (
        <div className="ai-error" role="alert">
          {state.error}
        </div>
      )}

      {/* AI summary panel */}
      {state.aiAvailable && state.summary && (
        <div className="ai-panel" role="dialog" aria-label="Call summary">
          <div className="ai-panel-header">
            <strong>Summary</strong>
            <button className="ai-close" onClick={onDismissSummary} aria-label="Dismiss summary">
              ✕
            </button>
          </div>
          <p className="ai-summary-text">{state.summary}</p>
          {state.actionItems.length > 0 && (
            <ul className="ai-action-items">
              {state.actionItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* AI answer panel */}
      {state.aiAvailable && state.answer && (
        <div className="ai-panel" role="dialog" aria-label="Answer">
          <div className="ai-panel-header">
            <strong>Answer</strong>
            <button className="ai-close" onClick={onDismissAnswer} aria-label="Dismiss answer">
              ✕
            </button>
          </div>
          <p className="ai-summary-text">{state.answer}</p>
        </div>
      )}

      {/* Ask box (meeting Q&A grounded in the transcript) */}
      {state.aiAvailable && state.captionsEnabled && (
        <div className="ai-ask">
          <input
            className="ai-ask-input"
            type="text"
            placeholder="Ask about the conversation…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitQuestion();
            }}
            aria-label="Ask about the conversation"
          />
          <button
            className="control-btn"
            onClick={submitQuestion}
            disabled={state.asking}
          >
            {state.asking ? "⏳" : "Ask"}
          </button>
        </div>
      )}

      <Controls
        micEnabled={state.micEnabled}
        cameraEnabled={state.cameraEnabled}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onHangup={onHangup}
        aiAvailable={state.aiAvailable}
        captionsEnabled={state.captionsEnabled}
        captionLanguage={state.captionLanguage}
        summarizing={state.summarizing}
        onToggleCaptions={onToggleCaptions}
        onCycleLanguage={onCycleLanguage}
        onSummarize={onSummarize}
      />
    </div>
  );
}
