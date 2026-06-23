import { describe, it, expect } from "vitest";
import { buildIceServers } from "./iceConfig";

describe("buildIceServers", () => {
  it("uses the default STUN server when none provided", () => {
    const servers = buildIceServers({});
    expect(servers).toEqual([{ urls: ["stun:stun.l.google.com:19302"] }]);
  });

  it("parses a comma-separated STUN list and trims whitespace", () => {
    const servers = buildIceServers({
      stunUrls: " stun:a:1 , stun:b:2 ,",
    });
    expect(servers).toEqual([{ urls: ["stun:a:1", "stun:b:2"] }]);
  });

  it("includes TURN only when url, username and credential are all set", () => {
    const servers = buildIceServers({
      stunUrls: "stun:a:1",
      turnUrl: "turn:t:3478",
      turnUsername: "user",
      turnCredential: "pass",
    });
    expect(servers).toContainEqual({
      urls: "turn:t:3478",
      username: "user",
      credential: "pass",
    });
  });

  it("omits TURN when credentials are incomplete", () => {
    const servers = buildIceServers({
      stunUrls: "stun:a:1",
      turnUrl: "turn:t:3478",
      turnUsername: "user",
      // credential missing
    });
    expect(servers).toHaveLength(1);
    expect(servers[0]).toEqual({ urls: ["stun:a:1"] });
  });
});
