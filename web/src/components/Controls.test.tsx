import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Controls } from "./Controls";

function setup(overrides: Partial<React.ComponentProps<typeof Controls>> = {}) {
  const props = {
    micEnabled: true,
    cameraEnabled: true,
    onToggleMic: vi.fn(),
    onToggleCamera: vi.fn(),
    onHangup: vi.fn(),
    ...overrides,
  };
  render(<Controls {...props} />);
  return props;
}

describe("<Controls /> (functional)", () => {
  it("reflects the mic state in its label", () => {
    setup({ micEnabled: true });
    expect(screen.getByRole("button", { name: /mute/i })).toHaveTextContent("Mute");
  });

  it("shows Unmute when the mic is disabled", () => {
    setup({ micEnabled: false });
    expect(screen.getByRole("button", { name: /unmute/i })).toBeInTheDocument();
  });

  it("invokes the correct handlers on click", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: /mute/i }));
    await user.click(screen.getByRole("button", { name: /camera off/i }));
    await user.click(screen.getByRole("button", { name: /end/i }));

    expect(props.onToggleMic).toHaveBeenCalledOnce();
    expect(props.onToggleCamera).toHaveBeenCalledOnce();
    expect(props.onHangup).toHaveBeenCalledOnce();
  });

  it("hides AI controls when AI is unavailable", () => {
    setup(); // aiAvailable defaults to false
    expect(screen.queryByRole("button", { name: /captions/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /summary/i })).toBeNull();
  });

  it("shows AI controls and disables language until captions are on", () => {
    setup({ aiAvailable: true, captionsEnabled: false });
    expect(screen.getByRole("button", { name: /captions/i })).toBeInTheDocument();
    expect(screen.getByTitle(/cycle live-translation language/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /summary/i })).toBeEnabled();
  });

  it("invokes AI handlers and reflects caption/summarizing state", async () => {
    const user = userEvent.setup();
    const onToggleCaptions = vi.fn();
    const onCycleLanguage = vi.fn();
    const onSummarize = vi.fn();
    setup({
      aiAvailable: true,
      captionsEnabled: true,
      captionLanguage: "Spanish",
      onToggleCaptions,
      onCycleLanguage,
      onSummarize,
    });

    // Language button shows the current language and is enabled now.
    const lang = screen.getByRole("button", { name: /spanish/i });
    expect(lang).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /captions on/i }));
    await user.click(lang);
    await user.click(screen.getByRole("button", { name: /summary/i }));

    expect(onToggleCaptions).toHaveBeenCalledOnce();
    expect(onCycleLanguage).toHaveBeenCalledOnce();
    expect(onSummarize).toHaveBeenCalledOnce();
  });

  it("shows a busy label and disables Summary while summarizing", () => {
    setup({ aiAvailable: true, summarizing: true });
    const btn = screen.getByRole("button", { name: /summarizing/i });
    expect(btn).toBeDisabled();
  });
});
