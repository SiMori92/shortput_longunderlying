import { createHmac } from "node:crypto";
import { expect, test } from "./authenticated";
import { atomicWrite } from "../../src/data/store";
import { JournalSchema, PortfolioEntriesSchema } from "../../src/schemas/portfolio";
test.beforeAll(async () => {
  await atomicWrite(".e2e-data/portfolio/entries.json", PortfolioEntriesSchema, []);
  await atomicWrite(".e2e-data/portfolio/journal.json", JournalSchema, []);
});
const secret = "playwright-only-m5-session-secret-32bytes-minimum";
function cookie() {
  const body = Buffer.from(JSON.stringify({ user: "owner", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
  return `__Host-strategy_session=${body}.${createHmac("sha256",secret).update(body).digest("base64url")}`;
}
test("authorized portfolio is editable; independent unsigned API requests fail closed", async ({ page, request }) => {
  await page.goto("/portfolio");
  await expect(page.getByRole("heading",{name:"Portfolio",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Save snapshot",exact:true})).toBeEnabled();
  expect((await request.put("/api/portfolio",{data:{}})).status()).toBe(401);
});
test("authorized portfolio entry, puts, persisted journal and four responsive widths", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: cookie() });
  await page.goto("/portfolio?date=2026-11-16");
  await page.getByLabel("Account value ($)",{exact:true}).fill("100000");
  await page.getByLabel("SOXL shares",{exact:true}).fill("0");
  await page.getByRole("button",{name:"Save snapshot",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Snapshot saved");
  await expect(page.getByLabel("Show working: Entered account value",{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Account value ($)",{exact:true})).toHaveValue("100000");
  await page.getByLabel("SOXL shares",{exact:true}).fill("100");
  // Existing test-data positions are removed through the same editor before adding a new row.
  while (await page.getByRole("button",{name:"Remove put 1",exact:true}).count()) await page.getByRole("button",{name:"Remove put 1",exact:true}).click();
  await page.getByRole("button",{name:"Add put",exact:true}).click();
  await page.getByLabel("Put 1 Opened",{exact:true}).fill("2026-11-13");
  await page.getByLabel("Put 1 Expiry",{exact:true}).fill("2026-11-20");
  await page.getByLabel("Put 1 Strike ($)",{exact:true}).fill("40");
  await page.getByLabel("Put 1 Contracts",{exact:true}).fill("2");
  await page.getByLabel("Put 1 Entry credit ($/share)",{exact:true}).fill("2");
  await page.getByRole("button",{name:"Save snapshot",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Snapshot saved");
  const done = `Held position · browser check ${Date.now()}`;
  await page.getByLabel("What was done",{exact:true}).fill(done);
  await page.getByLabel("Note",{exact:true}).fill("Manual test record; no order placed.");
  await page.getByRole("button",{name:"Add journal entry",exact:true}).click();
  await expect(page.getByText(done,{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText(done,{exact:true})).toBeVisible();
  await expect(page.getByLabel("Put 1 Contracts",{exact:true})).toHaveValue("2");
  for (const width of [360,768,1024,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.reload();
    await expect(page.getByLabel("Put 1 Contracts",{exact:true})).toHaveValue("2");
    await expect.poll(async()=>page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const control=await page.getByRole("button",{name:"Add put",exact:true}).boundingBox(); expect(control!.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => { window.scrollTo(0,0); (document.activeElement as HTMLElement | null)?.blur(); });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({path:`test-results/m5-portfolio-${width}.png`,fullPage:true});
  }
  await page.getByRole("button",{name:"Remove put 1",exact:true}).click();
  await page.getByRole("button",{name:"Save snapshot",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Snapshot saved");
  await page.reload(); await expect(page.getByText("No open puts entered",{exact:true})).toBeVisible();
});
test("edit snapshot in history opens that date in the editor", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: cookie() });
  for (const [date, nav] of [["2026-11-16","100000"],["2026-11-17","90000"]]) {
    await page.goto(`/portfolio?date=${date}`);
    await page.getByLabel("Account value ($)",{exact:true}).fill(nav);
    await page.getByRole("button",{name:"Save snapshot",exact:true}).click();
    await expect(page.getByRole("status")).toContainText("Snapshot saved");
  }
  await page.goto("/portfolio");
  await page.getByRole("row").filter({ hasText: "2026-11-16" }).getByRole("link",{name:"Edit snapshot"}).click();
  await expect(page).toHaveURL(/date=2026-11-16#snapshot-editor$/);
  await expect(page.getByRole("heading",{name:"Edit snapshot · 2026-11-16"})).toBeInViewport();
  await expect(page.getByLabel("Account value ($)",{exact:true})).toHaveValue("100000");
});
