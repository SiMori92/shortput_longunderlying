import { createHmac } from "node:crypto";
import { rm } from "node:fs/promises";
import { expect, test } from "./authenticated";
import { atomicWrite } from "../../src/data/store";
import { BarsSchema } from "../../src/schemas/bars";
import { ObservationsSchema } from "../../src/schemas/monitor";
import { UpdateStatusSchema } from "../../src/monitors/service";
import { expectedClose, sessions } from "../../src/market/calendar";
const asOf=expectedClose(new Date()),secret="playwright-only-m5-session-secret-32bytes-minimum";
test.describe.configure({mode:"serial"});
test.beforeAll(async()=>{await rm(".e2e-data/bars/SPAX.json",{force:true});await rm(".e2e-data/updates/latest.json",{force:true});await atomicWrite(".e2e-data/monitors/observations.json",ObservationsSchema,[]);});
test("fresh install shows six checks, unconfirmed facts and missing SPAX without a fabricated chart",async({page,request})=>{
 await page.goto("/spax");await expect(page.getByRole("heading",{name:"SPAX monitor",exact:true})).toBeVisible();await expect(page.locator(".monitor-checklist>section")).toHaveCount(6);await expect(page.getByText("No stored price history",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Save observation",exact:true})).toBeEnabled();expect((await request.put("/api/monitors",{data:{}})).status()).toBe(401);
 await expect(page.getByText("NOT READY",{exact:true})).toBeVisible();await expect(page.locator(".monitor-facts")).toContainText("unconfirmed");
});
test("manual IV and quotes persist, charts work, invalid spread is rejected, four widths fit",async({page,context})=>{
 // Synthetic prices are confined to .e2e-data; never used as market fixtures.
 const ds=sessions("2026-06-12",asOf),symbols=["SPAX","SPCX"];
 for(const symbol of symbols){const bars=ds.map((date,i)=>{const close=(symbol==="SPAX"?10:150)*Math.exp(i*.001+.02*Math.sin(i));return {date,open:close,high:close,low:close,close,volume:1000,adjclose:null};});await atomicWrite(`.e2e-data/bars/${symbol}.json`,BarsSchema,{schemaVersion:1,symbol,source:"yahoo",bars});}
 await atomicWrite(".e2e-data/updates/latest.json",UpdateStatusSchema,{timestamp:new Date().toISOString(),asOf,symbols:symbols.map(symbol=>({symbol,lastDate:asOf,expectedDate:asOf,count:ds.length,provisional:false,updated:true,issues:[]}))});
 const body=Buffer.from(JSON.stringify({user:"owner",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");await context.setExtraHTTPHeaders({Cookie:`__Host-strategy_session=${body}.${createHmac("sha256",secret).update(body).digest("base64url")}`});
 await page.goto(`/spax?date=${asOf}`);await page.getByLabel("Annual IV (%)",{exact:true}).fill("85");await page.getByLabel("Expiries",{exact:true}).selectOption("weekly");await page.getByLabel("Bid ($)",{exact:true}).fill("1");await page.getByLabel("Ask ($)",{exact:true}).fill(".5");await page.getByLabel("Open interest",{exact:true}).fill("500");await page.getByLabel("Put delta (−0.20)",{exact:true}).fill("-.2");await page.getByLabel("Quoted expiry",{exact:true}).fill(sessions(asOf,"2026-12-31")[5]!);await page.getByLabel("Source / screen note",{exact:true}).fill("SYNTHETIC BROWSER TEST ONLY — not market data");
 await page.getByRole("button",{name:"Save observation",exact:true}).click();await expect(page.locator(".field-error[role=alert]")).toContainText("Ask must be at least bid");await page.getByLabel("Ask ($)",{exact:true}).fill("1.05");await page.getByRole("button",{name:"Save observation",exact:true}).click();await expect(page.getByRole("status")).toContainText("Observation saved");await page.reload();await expect(page.getByLabel("Annual IV (%)",{exact:true})).toHaveValue("85");
 for(const width of [360,768,1024,1440]){
  await page.setViewportSize({width,height:1000});await page.reload();await expect(page.getByLabel("Annual IV (%)",{exact:true})).toHaveValue("85");await expect(page.locator(".chart-card[data-ready=true]")).toHaveCount(4);await expect(page.getByLabel("Daily leveraged tracking").locator("svg.recharts-surface")).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const button=page.getByRole("button",{name:"Save observation",exact:true});expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(()=>{window.scrollTo(0,0);(document.activeElement as HTMLElement|null)?.blur();});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.screenshot({path:`test-results/m6-spax-${width}.png`,fullPage:true});
 }
 await page.getByLabel("Show working: Manual IV to RV",{exact:true}).click();await expect(page.getByText("(manual IV percent / 100) / RV20",{exact:true})).toBeVisible();await page.keyboard.press("Escape");
 const chart=page.getByLabel("Daily leveraged tracking");await chart.scrollIntoViewIfNeeded();const b=(await chart.boundingBox())!;await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await expect(chart.locator(".recharts-tooltip-wrapper")).toBeVisible();
});
