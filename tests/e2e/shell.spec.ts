import { expect, test, regressionCookie } from "./authenticated";
import { readFile, rm } from "node:fs/promises";
import { atomicWrite } from "../../src/data/store";
import { RunResultSchema } from "../../src/schemas/run";
test.beforeAll(async () => {
  await atomicWrite(".e2e-data/runs/last-attempt.json", RunResultSchema, JSON.parse(await readFile("tests/fixtures/market/blocked-run.json", "utf8")));
});
test.afterAll(async () => { await rm(".e2e-data/runs/last-attempt.json", { force: true }); });
for (const width of [360, 768, 1024, 1440]) {
  test(`Today dashboard ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); await page.goto("/");
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "UNCONFIRMED", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today's actions" })).toBeVisible();
    await expect(page.getByText("Blocked · unconfirmed")).toHaveCount(3);
    const panel = page.getByRole("region", { name: "Run validation" });
    await expect(panel).toContainText("Unreviewed SOXX split 2026-11-05 ×3");
    await expect(panel).toContainText("2010-10-11, 2016-11-11");
    const nav = page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Main navigation", exact: true });
    for (const link of await nav.getByRole("link").all()) { const box = await link.boundingBox(); expect(box?.width).toBeGreaterThanOrEqual(44); expect(box?.height).toBeGreaterThanOrEqual(44); }
    await page.getByLabel("Show working: SOXL close", { exact: true }).click();
    await expect(page.locator("details[open]").getByText("bars.SOXL.close", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByLabel("Show working: SOXL close", { exact: true }).click();
    await page.route("**/api/runs", route => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "busy", message: "Run already in progress" }) }));
    await page.getByRole("button", { name: "Run now", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Run already in progress" })).toBeVisible();
    await page.getByRole("button", { name: "Dismiss run message" }).click();
    if (width === 1440) { const toggle = await page.getByRole("button", { name: "Collapse sidebar" }).boundingBox(); expect(toggle?.width).toBeGreaterThanOrEqual(44); expect(toggle?.height).toBeGreaterThanOrEqual(44); await page.getByRole("button", { name: "Collapse sidebar" }).click(); await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible(); await page.getByRole("button", { name: "Expand sidebar" }).click(); }
    await page.screenshot({ path: `test-results/m4-today-${width}.png`, fullPage: true, caret: "initial" });
    await page.goto("/portfolio"); await expect(page.getByRole("heading", { name: "Portfolio", exact: true })).toBeVisible();
  });
  test(`Gate dashboard ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); await page.goto("/gate");
    await expect(page.getByRole("heading", { name: "Gate", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gate episodes" })).toBeVisible();
    const trend = page.getByLabel("SOXX price and moving averages", { exact: true });
    await expect(trend.locator(".recharts-surface")).toBeVisible();
    await page.getByRole("button", { name: "5Y", exact: true }).click(); await expect(page.getByRole("button", { name: "5Y", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "1Y", exact: true }).click();
    const box = await trend.boundingBox(); if (!box) throw new Error("Chart missing");
    // A click at the plot activates the shared tooltip on pointer and touch devices.
    await page.mouse.click(box.x + box.width * .65, box.y + box.height * .4);
    await expect(trend.locator(".recharts-tooltip-wrapper")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.screenshot({ path: `test-results/m4-gate-${width}.png`, fullPage: true, caret: "initial" });
  });
  test(`Puts dashboard ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); await page.goto("/puts");
    await expect(page.getByText("No current account snapshot. Open positions are unconfirmed.")).toBeVisible();
    await expect(page.getByText("No recorded fills. Snapshot removals cannot establish a realized P&L.")).toBeVisible();
    await page.getByRole("link", { name: "V3.1 model", exact: true }).click();
    await expect(page.getByText("$4,803,823.03", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Archived V3", exact: true }).click();
    await expect(page.getByText("$4,392,157.22", { exact: true })).toBeVisible();
    await page.getByLabel("Model as of", { exact: true }).fill("2026-10-22"); await page.getByRole("button", { name: "View", exact: true }).click();
    await expect(page.getByText("Archived V3 model · 2026-10-22").first()).toBeVisible();
    await expect(page.getByText("$83.85", { exact: true }).first()).toBeVisible();
    await page.getByLabel("Show working: model-0 model value", { exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByLabel("Show working: model-0 model value", { exact: true }).click();
    await page.screenshot({ path: `test-results/m4-puts-${width}.png`, fullPage: true, caret: "initial" });
  });
}
test("health is schema-safe and strategy is not ready", async ({ request }) => {
  const response = await request.get("/api/health"); expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok", milestone: "M8", strategyReady: false });
});
test("gate tooltip responds to a phone tap", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 900 }, hasTouch: true, isMobile: true, extraHTTPHeaders: { Cookie: regressionCookie() } });
  const page = await context.newPage(); await page.goto("http://127.0.0.1:3100/gate");
  const chart = page.getByLabel("SOXX price and moving averages", { exact: true });
  await expect(chart.locator(".." )).toHaveAttribute("data-ready", "true");
  const box = await chart.boundingBox(); if (!box) throw new Error("Chart missing");
  await page.touchscreen.tap(box.x + box.width * .7, box.y + box.height * .45);
  await expect(chart.locator(".recharts-tooltip-wrapper")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

test("working disclosures stay within a 360px viewport and close with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  for (const [url, labels] of [
    ["/", ["SOXL close", "a value", "a threshold", "b distance to flip", "Kill threshold"]],
    ["/gate", ["SOXX trend chart", "Volatility ratio chart", "Gate episodes"]],
    ["/puts?book=archive&date=2026-10-22", ["model-0 strike", "model-0 model value", "model-0 model buy-back", "Gap stack"]],
  ] as const) {
    await page.goto(url);
    for (const label of labels) {
      const button = page.getByLabel(`Show working: ${label}`, { exact: true });
      await expect(button.locator("..")).toHaveAttribute("data-ready", "true");
      await button.click();
      const panel = page.locator("details.working[open] .working-content");
      await expect(panel).toBeVisible();
      await expect(panel).toHaveCSS("position", "fixed");
      await expect.poll(async () => { const box = await panel.boundingBox(); return !!box && box.x >= 0 && box.x + box.width <= 360 && box.y >= 0 && box.y + box.height <= 900; }).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.keyboard.press("Escape"); await expect(panel).toHaveCount(0);
    }
  }
});
