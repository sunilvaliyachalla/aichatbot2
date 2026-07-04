import { test, expect, type Page } from "@playwright/test";

/**
 * Functional E2E for the AI features. The ai-server (Whisper/Ollama) is mocked
 * at the network boundary so the test is deterministic and fast:
 *   • the caption WebSocket is faked with page.routeWebSocket — on each "flush"
 *     it returns a final caption frame;
 *   • /summarize and /ask are faked with page.route.
 * This drives the real UI end-to-end: captions overlay → transcript → summary.
 */

async function joinRoom(page: Page, roomId: string) {
  await page.goto("/");
  await page.getByLabel("Room ID").fill(roomId);
  await page.getByRole("button", { name: /join \/ create/i }).click();
}

const room = () => `ai-${Math.random().toString(36).slice(2, 8)}`;

test.describe("AI features (mocked backend)", () => {
  test.beforeEach(async ({ page }) => {
    // Stub the Web Audio API so AudioCaptioner.start() resolves instantly and
    // deterministically. Headless Chromium's real audio capture is flaky in CI,
    // and this E2E validates the app's caption/summary wiring, not the browser's
    // audio subsystem (the PCM downsampling is covered by unit tests).
    await page.addInitScript(() => {
      class FakeAudioContext {
        state = "running";
        sampleRate = 48000;
        destination = {};
        async resume() {}
        async close() {}
        createMediaStreamSource() {
          return { connect() {}, disconnect() {} };
        }
        createScriptProcessor() {
          return { connect() {}, disconnect() {}, onaudioprocess: null };
        }
        createGain() {
          return { gain: { value: 0 }, connect() {}, disconnect() {} };
        }
      }
      // @ts-expect-error override for tests
      window.AudioContext = FakeAudioContext;
      // @ts-expect-error legacy alias
      window.webkitAudioContext = FakeAudioContext;
    });

    // Fake caption WebSocket. Sends a caption both proactively (on connect) and
    // on each "flush", so the test does not depend on the 3 s audio-flush timing
    // (deterministic in headless). Binary PCM and lang:* commands are ignored.
    await page.routeWebSocket(/\/ws\/transcribe/, (ws) => {
      const sendCaption = () =>
        ws.send(
          JSON.stringify({
            type: "final",
            text: "we ship on tuesday",
            language: "en",
            segments: [],
          })
        );
      sendCaption();
      ws.onMessage((message) => {
        if (message === "flush") sendCaption();
      });
    });

    // Fake the LLM endpoints.
    await page.route("**/summarize", (route) =>
      route.fulfill({
        json: { summary: "We ship Tuesday.", action_items: ["Prepare demo"] },
      })
    );
    await page.route("**/ask", (route) =>
      route.fulfill({ json: { answer: "On Tuesday." } })
    );
  });

  test("captions overlay appears, then Summary shows a summary + action items", async ({
    page,
  }) => {
    await joinRoom(page, room());

    await page.getByRole("button", { name: /captions/i }).click();
    // First flush (~3s) yields a caption on the overlay.
    await expect(page.getByText("we ship on tuesday")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /summary/i }).click();
    await expect(page.getByText("We ship Tuesday.")).toBeVisible();
    await expect(page.getByText("Prepare demo")).toBeVisible();

    // Dismiss the summary panel.
    await page.getByRole("button", { name: /dismiss summary/i }).click();
    await expect(page.getByText("We ship Tuesday.")).toBeHidden();
  });

  test("Ask returns an answer grounded in the transcript", async ({ page }) => {
    await joinRoom(page, room());
    await page.getByRole("button", { name: /captions/i }).click();
    await expect(page.getByText("we ship on tuesday")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel(/ask about the conversation/i).fill("When do we ship?");
    await page.getByRole("button", { name: /^ask$/i }).click();
    await expect(page.getByText("On Tuesday.")).toBeVisible();
  });

  test("Summary with no transcript shows a helpful error", async ({ page }) => {
    await joinRoom(page, room());
    // Do NOT enable captions -> transcript is empty.
    await page.getByRole("button", { name: /summary/i }).click();
    await expect(
      page.getByText(/nothing to summarize yet/i)
    ).toBeVisible();
  });
});
