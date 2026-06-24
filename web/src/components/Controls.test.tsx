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
});
