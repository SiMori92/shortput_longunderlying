import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "./authenticated";
// Garden study v3 (UI_DESIGN_WORKBOOK.html): identity, responsive and painted-field behaviour.
const pages = ["/", "/gate", "/puts", "/portfolio", "/monitor", "/backtest", "/rules"];

test("garden shell keeps decisions legible at every workbook check width", async ({ page }) => {
  for (const width of [1440, 1151, 1150, 900, 651, 650, 390, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Today's actions" })).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(214, 217, 198)");
    await expect(page.getByRole("navigation", { name: width <= 650 ? "Mobile navigation" : "Main navigation", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("every page has one H1 on a chalk plaque and no page overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  for (const url of pages) {
    await page.goto(url);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".page-plaque h1")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator(".page-plaque").filter({ has: page.locator("h1") })).toHaveCSS("background-color", "rgb(250, 246, 234)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), url).toBe(true);
  }
});

test("the painted field is decorative, seeded per page and repaints identically", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/gate");
  const field = page.locator(".page-heading canvas.garden-field");
  await expect(field).toHaveAttribute("aria-hidden", "true");
  await expect(field).toHaveAttribute("data-painted", "true");
  const seed = await field.getAttribute("data-seed");
  // Identical draw commands per seed are unit-tested (tests/ui/garden-field.test.ts); GPU rasterisation is not byte-stable,
  // so the browser check is that the same seed paints at the same size after a reload.
  const size = () => field.evaluate((c: HTMLCanvasElement) => `${c.width}x${c.height}`);
  await page.waitForLoadState("networkidle");
  const first = await size();
  await page.reload();
  await expect(field).toHaveAttribute("data-painted", "true");
  await page.waitForLoadState("networkidle");
  expect(await field.getAttribute("data-seed")).toBe(seed);
  expect(await size()).toBe(first);
  await page.goto("/puts");
  expect(await page.locator(".page-heading canvas.garden-field").getAttribute("data-seed")).not.toBe(seed);
  // No external imagery is requested.
  const external: string[] = [];
  page.on("request", r => { if (!r.url().startsWith("http://127.0.0.1:3100")) external.push(r.url()); });
  await page.reload();
  expect(external).toEqual([]);
});

test("a failed page load shows a failed state with Retry, never an empty one", async ({ page }) => {
  const file = ".e2e-data/portfolio/entries.json", original = await readFile(file, "utf8");
  try {
    await writeFile(file, "{ damaged");
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { name: "Couldn't load this page", level: 1 })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "failed to load" })).toBeVisible();
    await expect(page.getByText("No snapshots saved")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  } finally { await writeFile(file, original); }
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Portfolio", exact: true })).toBeVisible();
});

test("unavailable reads as an em dash with a reason; unconfirmed and zero stay distinct", async ({ page }) => {
  await page.goto("/");
  const equity = page.locator(".metric").filter({ hasText: "Account equity" });
  await expect(equity.locator(".unavailable")).toContainText("Not available: needs an account snapshot");
  await expect(equity.locator(".metric-value")).toHaveText(/^—/);
  await expect(page.getByText("Blocked · unconfirmed").first()).toBeVisible();
  await page.goto("/backtest");
  // Months outside the replay window are an em dash, never 0.00%.
  await expect(page.locator('.returns-heatmap td.heat-empty').first()).toHaveText("—");
});
