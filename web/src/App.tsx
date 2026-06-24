import { useCall } from "./hooks/useCall";
import { Lobby } from "./components/Lobby";
import { VideoCall } from "./components/VideoCall";

export default function App() {
  const { state, localStream, remoteStream, join, hangup, toggleMic, toggleCamera } =
    useCall();

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
        />
      ) : (
        <Lobby
          onJoin={join}
          error={state.error}
          connecting={false}
        />
      )}
    </main>
  );
}
