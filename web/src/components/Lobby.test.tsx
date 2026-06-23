import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lobby } from "./Lobby";

describe("<Lobby /> (functional)", () => {
  it("renders the title and join controls", () => {
    render(<Lobby onJoin={vi.fn()} error={null} connecting={false} />);
    expect(screen.getByText("P2P Video Call")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join \/ create/i })).toBeInTheDocument();
  });

  it("calls onJoin with the typed room id on submit", async () => {
    const onJoin = vi.fn();
    const user = userEvent.setup();
    render(<Lobby onJoin={onJoin} error={null} connecting={false} />);

    await user.type(screen.getByLabelText("Room ID"), "my-room");
    await user.click(screen.getByRole("button", { name: /join \/ create/i }));

    expect(onJoin).toHaveBeenCalledWith("my-room");
  });

  it("populates the field when Random ID is clicked", async () => {
    const user = userEvent.setup();
    render(<Lobby onJoin={vi.fn()} error={null} connecting={false} />);

    const input = screen.getByLabelText("Room ID") as HTMLInputElement;
    expect(input.value).toBe("");
    await user.click(screen.getByRole("button", { name: /random id/i }));
    expect(input.value.length).toBeGreaterThan(0);
  });

  it("shows an error message when provided", () => {
    render(<Lobby onJoin={vi.fn()} error="Room is full (1:1 only)." connecting={false} />);
    expect(screen.getByText("Room is full (1:1 only).")).toBeInTheDocument();
  });

  it("disables the join button while connecting", () => {
    render(<Lobby onJoin={vi.fn()} error={null} connecting={true} />);
    expect(screen.getByRole("button", { name: /joining/i })).toBeDisabled();
  });
});
