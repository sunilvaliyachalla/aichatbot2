import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VideoCall } from "./VideoCall";
import type { CallState } from "../types";

function callState(overrides: Partial<CallState> = {}): CallState {
  return {
    status: "connected",
    roomId: "room-1",
    error: null,
    micEnabled: true,
    cameraEnabled: true,
    aiAvailable: true,
    captionsEnabled: false,
    caption: "",
    captionTranslation: "",
    captionLanguage: null,
    summarizing: false,
    summary: null,
    actionItems: [],
    asking: false,
    answer: null,
    ...overrides,
  };
}

function renderCall(state: CallState, handlers: Partial<React.ComponentProps<typeof VideoCall>> = {}) {
  return render(
    <VideoCall
      state={state}
      localStream={null}
      remoteStream={null}
      onToggleMic={vi.fn()}
      onToggleCamera={vi.fn()}
      onHangup={vi.fn()}
      onToggleCaptions={vi.fn()}
      onCycleLanguage={vi.fn()}
      onSummarize={vi.fn()}
      onDismissSummary={vi.fn()}
      onAsk={vi.fn()}
      onDismissAnswer={vi.fn()}
      {...handlers}
    />
  );
}

describe("<VideoCall /> AI (functional)", () => {
  it("renders the live caption and its translation", () => {
    renderCall(
      callState({
        captionsEnabled: true,
        caption: "hello there",
        captionTranslation: "hola",
      })
    );
    expect(screen.getByText("hello there")).toBeInTheDocument();
    expect(screen.getByText("hola")).toBeInTheDocument();
  });

  it("does not show a caption overlay when captions are off", () => {
    renderCall(callState({ captionsEnabled: false, caption: "ghost" }));
    expect(screen.queryByText("ghost")).toBeNull();
  });

  it("shows the summary + action items and dismisses them", async () => {
    const user = userEvent.setup();
    const onDismissSummary = vi.fn();
    renderCall(
      callState({
        summary: "We ship Tuesday.",
        actionItems: ["Prepare demo", "Send invites"],
      }),
      { onDismissSummary }
    );

    expect(screen.getByText("We ship Tuesday.")).toBeInTheDocument();
    expect(screen.getByText("Prepare demo")).toBeInTheDocument();
    expect(screen.getByText("Send invites")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /dismiss summary/i }));
    expect(onDismissSummary).toHaveBeenCalledOnce();
  });

  it("submits a question and clears the input", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    renderCall(callState({ captionsEnabled: true }), { onAsk });

    const input = screen.getByLabelText(/ask about the conversation/i);
    await user.type(input, "When do we ship?");
    await user.click(screen.getByRole("button", { name: /^ask$/i }));

    expect(onAsk).toHaveBeenCalledWith("When do we ship?");
    expect(input).toHaveValue("");
  });

  it("does not submit an empty/whitespace question", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    renderCall(callState({ captionsEnabled: true }), { onAsk });

    await user.type(screen.getByLabelText(/ask about the conversation/i), "   ");
    await user.click(screen.getByRole("button", { name: /^ask$/i }));
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("shows the answer panel and dismisses it", async () => {
    const user = userEvent.setup();
    const onDismissAnswer = vi.fn();
    renderCall(callState({ answer: "On Tuesday." }), { onDismissAnswer });

    expect(screen.getByText("On Tuesday.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /dismiss answer/i }));
    expect(onDismissAnswer).toHaveBeenCalledOnce();
  });

  it("hides AI UI entirely when aiAvailable is false", () => {
    renderCall(callState({ aiAvailable: false, summary: "x", answer: "y" }));
    expect(screen.queryByText("x")).toBeNull();
    expect(screen.queryByText("y")).toBeNull();
    expect(screen.queryByLabelText(/ask about the conversation/i)).toBeNull();
  });
});
