import { describe, it, expect, vi, afterEach } from "vitest";
import { summarize, ask } from "./AiClient";

function mockFetch(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AiClient.summarize (unit)", () => {
  it("maps action_items -> actionItems and posts the transcript", async () => {
    const fetchMock = mockFetch(200, {
      summary: "We ship Tuesday.",
      action_items: ["B prepares demo", "B sends invites"],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await summarize("/summarize", "A: ship tuesday");

    expect(result).toEqual({
      summary: "We ship Tuesday.",
      actionItems: ["B prepares demo", "B sends invites"],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/summarize");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      transcript: "A: ship tuesday",
    });
  });

  it("defaults missing fields to empty summary + []", async () => {
    vi.stubGlobal("fetch", mockFetch(200, {}));
    expect(await summarize("/summarize", "x")).toEqual({
      summary: "",
      actionItems: [],
    });
  });

  it("throws with status + body on a non-2xx response", async () => {
    vi.stubGlobal("fetch", mockFetch(503, "llm unreachable"));
    await expect(summarize("/summarize", "x")).rejects.toThrow(/503.*llm unreachable/);
  });
});

describe("AiClient.ask (unit)", () => {
  it("returns the answer and posts transcript + question", async () => {
    const fetchMock = mockFetch(200, { answer: "On Tuesday." });
    vi.stubGlobal("fetch", fetchMock);

    const answer = await ask("/ask", "A: ship tuesday", "When?");

    expect(answer).toBe("On Tuesday.");
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body).toEqual({ transcript: "A: ship tuesday", question: "When?" });
  });

  it("returns empty string when answer is absent", async () => {
    vi.stubGlobal("fetch", mockFetch(200, {}));
    expect(await ask("/ask", "x", "q")).toBe("");
  });
});
