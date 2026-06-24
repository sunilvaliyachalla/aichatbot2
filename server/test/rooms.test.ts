import { describe, it, expect } from "vitest";
import { RoomRegistry } from "../src/rooms.js";
import { isValidRoomId } from "../src/server.js";

describe("RoomRegistry (unit)", () => {
  it("returns existing peers when adding and tracks size", () => {
    const rooms = new RoomRegistry();
    expect(rooms.add("r1", "a")).toEqual([]); // first peer sees nobody
    expect(rooms.add("r1", "b")).toEqual(["a"]); // second sees the first
    expect(rooms.size("r1")).toBe(2);
    expect(rooms.peers("r1").sort()).toEqual(["a", "b"]);
  });

  it("deletes the room when the last peer leaves", () => {
    const rooms = new RoomRegistry();
    rooms.add("r1", "a");
    rooms.add("r1", "b");
    expect(rooms.remove("r1", "a")).toBe(true);
    expect(rooms.size("r1")).toBe(1);
    expect(rooms.remove("r1", "b")).toBe(true);
    expect(rooms.size("r1")).toBe(0);
    expect(rooms.roomCount()).toBe(0);
  });

  it("returns false when removing a peer that was never present", () => {
    const rooms = new RoomRegistry();
    expect(rooms.remove("ghost", "x")).toBe(false);
  });
});

describe("isValidRoomId (unit)", () => {
  it("accepts non-empty strings up to 128 chars", () => {
    expect(isValidRoomId("room")).toBe(true);
    expect(isValidRoomId("a".repeat(128))).toBe(true);
  });

  it("rejects invalid ids", () => {
    expect(isValidRoomId("")).toBe(false);
    expect(isValidRoomId("   ")).toBe(false);
    expect(isValidRoomId("a".repeat(129))).toBe(false);
    expect(isValidRoomId(42)).toBe(false);
  });
});
