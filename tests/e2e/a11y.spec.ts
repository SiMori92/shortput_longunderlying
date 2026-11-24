import AxeBuilder from "@axe-core/playwright";
import { expect, regressionCookie, test } from "./authenticated";
// Workbook §10 accessibility baseline and §12 interaction checklist.
const pages = ["/", "/gate", "/puts", "/portfolio", "/monitor", "/backtest", "/rules"];

for (const width of [1440, 375]) {
  test(`axe finds no WCAG 2.1 AA violations at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 1000 });
    const found: string[] = [];
    for (const url of pages) {
      await page.goto(url);
      await expect(page.locator("h1")).toHaveCount(1);
      await page.waitForLoadState("networkidle");
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      found.push(...violations.map(v => `${url} ${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`));
    }
    expect(found).toEqual([]);
  });
}

test("login page has no WCAG 2.1 AA violations", async ({ browser }) => {
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto("http://127.0.0.1:3100/login"); await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
  await context.close();
});

test("skip link is the first stop and moves focus to main", async ({ page }) => {
  await page.goto("/gate");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("focus is a visible violet outline", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveCSS("outline-style", "solid");
  await expect(focused).toHaveCSS("outline-color", "rgb(68, 60, 107)");
  await expect(focused).toHaveCSS("outline-width", "3px");
});

test("wide tables scroll inside labelled, keyboard-focusable regions", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/backtest");
  const region = page.getByRole("region", { name: "Monthly returns, scrollable" });
  await expect(region).toHaveAttribute("tabindex", "0");
  await region.focus();
  const before = await region.evaluate(el => el.scrollLeft);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("charts are readable from the keyboard and offer a table view", async ({ page }) => {
  await page.goto("/gate");
  const chart = page.getByLabel("SOXX price and moving averages", { exact: true });
  await expect(chart.locator("..")).toHaveAttribute("data-ready", "true");
  await chart.locator("svg.recharts-surface").focus();
  await page.keyboard.press("ArrowRight");
  await expect(chart.locator(".chart-tip")).toBeVisible();
  const table = page.locator(".chart-card").first().locator("details.chart-table");
  await table.locator("summary").click();
  await expect(table.getByRole("region", { name: "SOXX trend as a table" })).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(20);
});

test("reduced motion removes transitions and animation", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", extraHTTPHeaders: { Cookie: regressionCookie() } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3100/");
  await expect(page.getByRole("button", { name: "Run now", exact: true })).toHaveCSS("transition-duration", "0s");
  await context.close();
});

test("at 200% zoom (720px CSS viewport) the page stays operable", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto("/portfolio");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  const save = page.getByRole("button", { name: "Save snapshot", exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await expect(page.getByRole("button", { name: "Run now", exact: true })).toBeInViewport();
});
