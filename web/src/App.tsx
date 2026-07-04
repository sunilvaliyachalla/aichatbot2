import { useCall } from "./hooks/useCall";
import { Lobby } from "./components/Lobby";
import { VideoCall } from "./components/VideoCall";

export default function App() {
  const {
    state,
    localStream,
    remoteStream,
    join,
    hangup,
    toggleMic,
    toggleCamera,
    toggleCaptions,
    cycleCaptionLanguage,
    requestSummary,
    dismissSummary,
    ask,
    dismissAnswer,
  } = useCall();

  // Show the lobby before a call starts (idle/ended/error-before-join).
  const inCall =
    state.status === "connecting" ||
    state.status === "waiting" ||
    state.status === "connected" ||
    state.status === "reconnecting";

  return (
    <main className="app">
      {inCall ? (
        <VideoCall
          state={state}
          localStream={localStream}
          remoteStream={remoteStream}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onHangup={hangup}
          onToggleCaptions={toggleCaptions}
          onCycleLanguage={cycleCaptionLanguage}
          onSummarize={requestSummary}
          onDismissSummary={dismissSummary}
          onAsk={ask}
          onDismissAnswer={dismissAnswer}
        />
      ) : (
        <Lobby onJoin={join} error={state.error} connecting={false} />
      )}
    </main>
  );
}
