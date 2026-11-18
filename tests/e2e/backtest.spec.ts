import { expect, test } from "./authenticated";
import { rm } from "node:fs/promises";
import { readJson } from "../../src/data/store";
import { ReplayFixtureSchema } from "../../src/schemas/backtest";
const golden=await readJson("tests/fixtures/v3_1.json",ReplayFixtureSchema);
test.beforeAll(async()=>{await rm(".e2e-data/backtest",{recursive:true,force:true});});
for(const width of [360,768,1024,1440]){
 test(`Backtest Python tables and charts ${width}px`,async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width,height:1000});await page.goto("/backtest");await expect(page.getByRole("heading",{name:"Backtest",exact:true})).toBeVisible();await expect(page.getByText(/Seed-history replay/)).toBeVisible();
  await expect(page.locator(".chart-card[data-ready=true]")).toHaveCount(2);await expect(page.getByLabel("Backtest model equity history").locator("svg.recharts-surface")).toBeVisible();await expect(page.getByLabel("Backtest underwater history").locator("svg.recharts-surface")).toBeVisible();
  const heat=page.getByRole("table",{name:"V3.1 monthly returns heatmap"});await expect(heat.locator("tbody tr")).toHaveCount(9);
  await expect(heat.locator("tbody tr").first().locator('td[data-label="Jan"]')).toContainText(`${(golden.monthly["2018-01"]!*100).toFixed(2)}%`);
  await expect(heat.locator("tbody tr").last().locator('td[data-label="Dec"]')).toHaveText("—");await expect(heat.locator("tbody tr").last().locator('td[data-label="Year total"]')).toContainText(`${(golden.yearly["2026"]!*100).toFixed(2)}%`);
  await expect(page.getByLabel("Show working: V3.1 model final equity",{exact:true}).locator("../..")).toContainText("$4,803,823.03");await expect(page.getByLabel("Show working: Archived V3 model final equity",{exact:true}).locator("../..")).toContainText("$4,392,157.22");
  await expect(page.getByRole("table",{name:"Yearly strategy returns"}).locator("tbody tr")).toHaveCount(9);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{scrollTo(0,0);(document.activeElement as HTMLElement|null)?.blur();});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.screenshot({path:`test-results/m7-backtest-${width}.png`,fullPage:true});
  await page.getByLabel("Show working: 2018 Jan return",{exact:true}).click();await expect(page.getByText(/Period-end equity \/ prior period-end equity/).first()).toBeVisible();await page.keyboard.press("Escape");
  if(width===360){await page.getByRole("button",{name:"Linear",exact:true}).click();await expect(page.getByRole("button",{name:"Linear",exact:true})).toHaveAttribute("aria-pressed","true");const chart=page.getByLabel("Backtest model equity history");await chart.scrollIntoViewIfNeeded();const box=(await chart.boundingBox())!;await page.mouse.click(box.x+box.width*.5,box.y+box.height*.5);await expect(chart.locator(".recharts-tooltip-wrapper")).toBeVisible();}
  expect(errors).toEqual([]);
 });
 test(`Rules live and collapsed archive ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});await page.goto("/rules");await expect(page.getByRole("heading",{name:"Rules",exact:true})).toBeVisible();await expect(page.getByRole("table",{name:"V3.1 rule parameters"})).toBeVisible();await expect(page.locator(".archive-rules")).not.toHaveAttribute("open");
  await expect(page.getByLabel("Show working: V3.1 Core weight cap",{exact:true}).locator("../..")).toContainText("30.00%");await expect(page.getByRole("table",{name:"V3.1 rule parameters",exact:true}).getByText("Manual KILL · live only",{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>{scrollTo(0,0);(document.activeElement as HTMLElement|null)?.blur();});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.screenshot({path:`test-results/m7-rules-${width}.png`,fullPage:true});
  await page.getByText("Archived: V3",{exact:true}).click();await expect(page.getByRole("table",{name:"V3 rule parameters",exact:true})).toBeVisible();await expect(page.getByLabel("Show working: V3 Gate logic",{exact:true}).locator("../..")).toContainText("all-conditions");
  await page.getByLabel("Show working: V3.1 Manual KILL · live only",{exact:true}).click();await expect(page.getByLabel("Show working: V3.1 Manual KILL · live only",{exact:true}).locator("..").getByText(/excluded from backtest loop/)).toBeVisible();await page.keyboard.press("Escape");
 });
}
