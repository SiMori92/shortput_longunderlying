import { expect, test } from "@playwright/test";
import { generateSync } from "otplib";
import { rm } from "node:fs/promises";
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { await rm(".e2e-data/auth", { recursive: true, force: true }); });
test("anonymous pages, RSC and APIs are private; health and login are public", async ({ page, request }) => {
  for (const path of ["/", "/gate", "/puts", "/portfolio", "/spax", "/backtest", "/rules", "/unknown"]) {
    const response = await request.get(path, { maxRedirects: 0 }); expect(response.status()).toBe(307); expect(response.headers().location).toContain("/login");
  }
  for (const path of ["/api/runs", "/api/portfolio", "/api/monitors", "/api/unknown"]) expect((await request.get(path)).status()).toBe(401);
  const rsc = await request.get("/portfolio?_rsc=private", { headers: { RSC: "1", "x-middleware-subrequest": "src/proxy:src/proxy:src/proxy:src/proxy:src/proxy" }, maxRedirects: 0 }); expect(rsc.status()).toBe(307);
  expect((await request.get("/api/health")).status()).toBe(200);
  await page.goto("/login"); await expect(page.getByRole("heading", { name: "Private workspace" })).toBeVisible(); await expect(page.getByRole("navigation")).toHaveCount(0);
  for (const width of [360,768,1024,1440]) { await page.setViewportSize({width,height:1000}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await page.screenshot({path:`test-results/m8-login-${width}.png`,fullPage:true}); }
});
test("password/TOTP login, secure browser cookie, logout and replay protection", async ({page, context}) => {
  await page.goto("/login");
  await page.getByLabel("Password", {exact:true}).fill("incorrect"); await page.getByLabel("Authenticator code",{exact:true}).fill("000000"); await page.getByRole("button", {name:"Sign in",exact:true}).click(); await expect(page.getByRole("status")).toContainText("invalid");
  const code = generateSync({secret:"JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"});
  await page.getByLabel("Password",{exact:true}).fill("playwright-only-password-2026"); await page.getByLabel("Authenticator code",{exact:true}).fill(code); await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Today",exact:true})).toBeVisible();
  const cookie=(await context.cookies()).find(c=>c.name==="__Host-strategy_session"); expect(cookie).toMatchObject({httpOnly:true,secure:true,sameSite:"Strict",path:"/"});
  await page.goto("/portfolio"); await expect(page.getByRole("button",{name:"Save snapshot",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Sign out",exact:true}).click(); await expect(page).toHaveURL(/\/login$/); expect((await context.cookies()).some(c=>c.name==="__Host-strategy_session")).toBe(false);
  const replay=await context.request.post("/api/auth/login",{headers:{origin:"http://127.0.0.1:3100"},data:{password:"playwright-only-password-2026",token:code}}); expect(replay.status()).toBe(401);
});
test("rate limit returns cooldown and cannot be bypassed with an IP header",async({request})=>{
  await rm(".e2e-data/auth",{recursive:true,force:true});
  for(let i=0;i<5;i++) expect((await request.post("/api/auth/login",{headers:{origin:"http://127.0.0.1:3100","x-forwarded-for":`192.0.2.${i}`},data:{password:"incorrect",token:"000000"}})).status()).toBe(401);
  const response=await request.post("/api/auth/login",{headers:{origin:"http://127.0.0.1:3100","x-forwarded-for":"203.0.113.9"},data:{password:"incorrect",token:"000000"}}); expect(response.status()).toBe(429); expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
});
