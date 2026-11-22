import { expect, test } from "./authenticated";

test("handbook shell keeps decisions legible at target widths", async ({ page }) => {
  for (const width of [1440, 1150, 900, 650, 390, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Today's actions" })).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(247, 245, 239)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440) {
      await expect(page.locator(".artwork-caption a")).toBeVisible();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.screenshot({ path: "test-results/handbook-today-desktop.png", fullPage: true });
    }
    if (width === 375) await page.screenshot({ path: "test-results/handbook-today-mobile.png", fullPage: true });
  }
});

test("filters and rerenders keep the same painting; refresh advances it", async ({ page }) => {
  await page.goto("/puts?book=model");
  const caption = page.locator(".artwork-caption a");
  await expect(caption).toBeVisible();
  const original = await caption.getAttribute("href");
  await page.getByRole("link", { name: "Archived V3", exact: true }).click();
  await expect(caption).toHaveAttribute("href", original!);
  await page.reload();
  await expect(caption).toBeVisible();
  await expect(caption).not.toHaveAttribute("href", original!);
});

test("failed artwork keeps the header usable without a misleading caption", async ({ page }) => {
  await page.route("**/art/*.jpg", route => route.abort());
  await page.goto("/gate");
  await expect(page.getByRole("heading", { name: "Gate", exact: true })).toBeVisible();
  await expect(page.locator(".artwork-caption")).toHaveText("Art collection · public domain");
  await expect(page.locator(".artwork-caption a")).toHaveCount(0);
});
