import { test, expect } from "@playwright/test";

test.describe("Lobby", () => {
  test("loads the app", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "P2P Video Call" })).toBeVisible();
    await expect(page.getByRole("button", { name: /join \/ create/i })).toBeVisible();
  });

  test("shows a validation error when joining with an empty room id", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /join \/ create/i }).click();
    await expect(page.getByText("Please enter a room ID.")).toBeVisible();
  });

  test("Random ID fills the room field", async ({ page }) => {
    await page.goto("/");
    const input = page.getByLabel("Room ID");
    await expect(input).toHaveValue("");
    await page.getByRole("button", { name: /random id/i }).click();
    await expect(input).not.toHaveValue("");
  });
});
