import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Mock socket.io-client so useCall can run without a real server. ---
const fakeSocket = {
  id: "self-socket",
  on: vi.fn(),
  io: { on: vi.fn(), removeAllListeners: vi.fn() },
  // joinRoom uses socket.timeout(ms).emit(event, payload, ack)
  timeout: vi.fn(() => ({
    emit: (_event: string, _payload: unknown, ack: (err: null, res: unknown) => void) => {
      ack(null, { ok: true, selfId: "self-socket", peers: [] });
    },
  })),
  emit: vi.fn(),
  removeAllListeners: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => fakeSocket),
}));

import App from "./App";

function fakeStream(): MediaStream {
  const track = { enabled: true, stop: vi.fn() };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) },
  });
});

describe("<App /> (functional)", () => {
  it("shows the lobby on first render", () => {
    render(<App />);
    expect(screen.getByText("P2P Video Call")).toBeInTheDocument();
  });

  it("shows a validation error when joining with an empty room id", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /join \/ create/i }));
    expect(await screen.findByText("Please enter a room ID.")).toBeInTheDocument();
  });

  it("joins a room and waits for a peer (no one else present)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Room ID"), "room-42");
    await user.click(screen.getByRole("button", { name: /join \/ create/i }));

    // Acquired local media and transitioned into the in-call waiting state.
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled()
    );
    // The "waiting" label appears in both the status bar and the video
    // placeholder, so assert at least one is present.
    const waiting = await screen.findAllByText("Waiting for someone to join…");
    expect(waiting.length).toBeGreaterThan(0);
    expect(screen.getByText("Room: room-42")).toBeInTheDocument();
  });
});
