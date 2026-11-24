import { expect, test } from "./authenticated";
// Captures full-page screenshots of every page at desktop, tablet and phone widths (garden.spec.ts checks every breakpoint).
// Runs only when UI_EVIDENCE_DIR is set, e.g. UI_EVIDENCE_DIR=reports/ui-v3-after pnpm test:e2e ui-evidence
const dir = process.env.UI_EVIDENCE_DIR;
const pages = [["today", "/"], ["gate", "/gate"], ["puts", "/puts"], ["portfolio", "/portfolio"], ["monitor", "/monitor"], ["backtest", "/backtest"], ["rules", "/rules"]] as const;
test.skip(!dir, "Set UI_EVIDENCE_DIR to capture UI evidence screenshots");
for (const [name, url] of pages) {
  test(`evidence ${name}`, async ({ page }) => {
    for (const width of [1440, 900, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(url);
      await expect(page.locator("h1")).toHaveCount(1);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${dir}/${name}-${width}.jpg`, type: "jpeg", quality: 70, fullPage: true, caret: "initial", animations: "disabled" });
    }
  });
}
test("evidence login", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3100/login");
  await page.screenshot({ path: `${dir}/login-1440.jpg`, type: "jpeg", quality: 70, fullPage: true });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.screenshot({ path: `${dir}/login-375.jpg`, type: "jpeg", quality: 70, fullPage: true });
  await context.close();
});
