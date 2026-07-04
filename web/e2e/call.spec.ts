import { test, expect, type Page } from "@playwright/test";

/** Join a room from a fresh page (grants fake camera/mic via launch flags). */
async function joinRoom(page: Page, roomId: string) {
  await page.goto("/");
  await page.getByLabel("Room ID").fill(roomId);
  await page.getByRole("button", { name: /join \/ create/i }).click();
}

function room() {
  return `e2e-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("Call", () => {
  test("solo join enters the room and shows AI controls (wired)", async ({ page }) => {
    await joinRoom(page, room());

    // Transitioned into the in-call waiting state.
    await expect(page.getByText("Waiting for someone to join…").first()).toBeVisible();

    // AI features are configured (VITE_AI_SERVER_URL=proxy), so the captions
    // control is present even though we don't invoke the ai-server here.
    await expect(page.getByRole("button", { name: /captions/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /summary/i })).toBeVisible();
  });

  test("two peers connect over WebRTC (P2P via signaling)", async ({ browser }) => {
    const roomId = room();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await joinRoom(pageA, roomId);
    await expect(pageA.getByText("Waiting for someone to join…").first()).toBeVisible();

    await joinRoom(pageB, roomId);

    // Both sides should reach the connected state once media negotiates.
    await expect(pageA.getByText("Connected").first()).toBeVisible({ timeout: 30_000 });
    await expect(pageB.getByText("Connected").first()).toBeVisible({ timeout: 30_000 });

    // A remote <video> element is present and playing on each side.
    await expect(pageA.locator("video.remote-video")).toBeVisible();
    await expect(pageB.locator("video.remote-video")).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });

  test("rejects a third peer (1:1 room is full)", async ({ browser }) => {
    const roomId = room();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const ctxC = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const pageC = await ctxC.newPage();

    await joinRoom(pageA, roomId);
    await joinRoom(pageB, roomId);
    await expect(pageA.getByText("Connected").first()).toBeVisible({ timeout: 30_000 });

    await joinRoom(pageC, roomId);
    await expect(pageC.getByText("Room is full (1:1 only).")).toBeVisible();

    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  });
});
