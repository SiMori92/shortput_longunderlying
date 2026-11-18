import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { seedData } from "../../src/data/seed";
import { atomicWrite, readJson } from "../../src/data/store";
import { PortfolioCommandSchema, PortfolioEntrySchema } from "../../src/schemas/portfolio";
import { readPortfolio, savePortfolio, PortfolioConflict } from "../../src/portfolio/service";
import { recommendation, consistency } from "../../src/portfolio/model";
import { GET, PUT } from "../../src/app/api/portfolio/route";
import { SESSION_COOKIE } from "../../src/auth/session";
import { FeatureSchema, ReplayFixtureSchema } from "../../src/schemas/backtest";
import { RulesSchema } from "../../src/schemas/config";
import { RunResultSchema } from "../../src/schemas/run";
import { analyzeRun } from "../../src/runs/analysis";
let root: string;
const now = new Date("2026-11-18T22:00:00Z"), secret = "m5-test-only-session-secret-at-least-32-bytes";
const entry = { date: "2026-11-16", accountValue: 100000, shares: 0, openPuts: [] };
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), "strategy-m5-")); await seedData(root); vi.stubEnv("DATA_DIR", root); vi.stubEnv("SESSION_SECRET", secret); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
function request(input: unknown, extra: Record<string,string> = {}) {
  const body = Buffer.from(JSON.stringify({ user: "owner", totp: true, exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
  return new Request("https://monitor.example/api/portfolio", { method: "PUT", headers: { cookie: `${SESSION_COOKIE}=${body}.${createHmac("sha256",secret).update(body).digest("base64url")}`, origin: "https://monitor.example", "content-type": "application/json", ...extra }, body: JSON.stringify(input) });
}
it("upserts a dated snapshot atomically, preserves other dates and survives fresh reads", async () => {
  let state = await readPortfolio(root);
  state = await savePortfolio({ operation: "snapshot", revision: state.revision, entry }, root, now);
  state = await savePortfolio({ operation: "snapshot", revision: state.revision, entry: { ...entry, date: "2026-11-17", shares: 100 } }, root, now);
  state = await savePortfolio({ operation: "snapshot", revision: state.revision, entry: { ...entry, shares: 12 } }, root, now);
  expect(state.entries.map(e => e.shares)).toEqual([12,100]);
  expect((await readPortfolio(root)).revision).toBe(state.revision);
  expect(JSON.parse(await readFile(path.join(root,"portfolio/entries.json"),"utf8"))).toHaveLength(2);
});
it("rejects stale revisions and an existing process lock without losing data", async () => {
  const state = await readPortfolio(root), cmd = { operation: "snapshot" as const, revision: state.revision, entry };
  const results = await Promise.allSettled([savePortfolio(cmd,root,now),savePortfolio(cmd,root,now)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  await expect(savePortfolio(cmd,root,now)).rejects.toBeInstanceOf(PortfolioConflict);
  const current = await readPortfolio(root); await writeFile(path.join(root,"portfolio/.write.lock"),"");
  await expect(savePortfolio({ ...cmd,revision:current.revision },root,now)).rejects.toBeInstanceOf(PortfolioConflict);
  expect((await readPortfolio(root)).entries).toEqual([entry]);
});
it("API enforces authentication, origin, media type, size, dates and strict schemas", async () => {
  const state = await readPortfolio(root), cmd = { operation: "snapshot", revision: state.revision, entry };
  expect((await GET(new Request("https://monitor.example/api/portfolio"))).status).toBe(401);
  expect((await PUT(request(cmd,{cookie:""}))).status).toBe(401);
  expect((await PUT(request(cmd,{origin:"https://evil.example"}))).status).toBe(403);
  expect((await PUT(request(cmd,{"content-type":"text/plain"}))).status).toBe(415);
  expect((await PUT(request({ ...cmd, rogue: true }))).status).toBe(400);
  expect((await PUT(request({ ...cmd, entry: { ...entry,date:"2026-11-15" } }))).status).toBe(400);
  expect((await PUT(request({ ...cmd, entry: { ...entry,date:"2099-01-01" } }))).status).toBe(400);
  expect((await PUT(request({ ...cmd, entry: { ...entry,date:"1900-01-01" } }))).status).toBe(400);
  expect((await PUT(request({ ...cmd, padding: "x".repeat(66000) }))).status).toBe(400);
  expect((await PUT(request(cmd))).status).toBe(200);
  expect((await PUT(request(cmd))).status).toBe(409);
});
it("validates put identities, symbols, opening dates and whole sizing", () => {
  const put = { id:"p",symbol:"SOXL",opened:entry.date,expiry:"2026-11-20",strike:40,contracts:1,credit:2 };
  for (const p of [{...put,contracts:1.5},{...put,credit:-1},{...put,symbol:"NVDL"},{...put,opened:"2026-11-17"},{...put,expiry:"2026-11-10"}]) expect(PortfolioEntrySchema.safeParse({...entry,openPuts:[p]}).success).toBe(false);
  expect(PortfolioEntrySchema.safeParse({...entry,openPuts:[put,put]}).success).toBe(false);
  expect(PortfolioCommandSchema.safeParse({operation:"journal",revision:"0".repeat(64),date:entry.date,done:" ",note:""}).success).toBe(false);
});
it("journal requires a snapshot and freezes server-owned advice; blocked advice is unconfirmed", async () => {
  let state = await readPortfolio(root);
  await expect(savePortfolio({operation:"journal",revision:state.revision,date:entry.date,done:"Held cash",note:""},root,now)).rejects.toThrow("Save a snapshot");
  state = await savePortfolio({operation:"snapshot",revision:state.revision,entry},root,now);
  state = await savePortfolio({operation:"journal",revision:state.revision,date:entry.date,done:"Held cash",note:"<script>example</script>"},root,now);
  expect(state.journal[0]).toMatchObject({runId:"unconfirmed",done:"Held cash",note:"<script>example</script>"});
  const features = await readJson("tests/fixtures/features.json",z.array(FeatureSchema)), rules = await readJson("config/rules/v3_1.json",RulesSchema);
  const run = analyzeRun({type:"final",timestamp:"2026-11-16T21:20:00Z",asOf:entry.date},features,rules,{},[entry],[],[]);
  await atomicWrite(path.join(root,`runs/${entry.date}_final.json`),RunResultSchema,run);
  state = await savePortfolio({operation:"journal",revision:state.revision,date:entry.date,done:"No trade",note:""},root,now);
  expect(state.journal[1]?.runId).toBe(run.id); expect(state.journal[1]?.recommendation).toContain("no trade");
  expect(recommendation({...run,type:"preview"},entry.date).runId).toBe("unconfirmed");
  expect(recommendation({...run,freshness:{...run.freshness,actionsBlocked:true}},entry.date).runId).toBe("unconfirmed");
});
it("flags quantity changes, modified or removed puts and missing prior finals", () => {
  const p={id:"p",symbol:"SOXL",opened:"2026-11-13",expiry:"2026-11-20",strike:40,contracts:1,credit:2};
  const previous={...entry,date:"2026-11-13",openPuts:[p]};
  expect(consistency({...entry,shares:100},previous,null).join(" ")).toMatch(/shares 100.*removed.*unconfirmed/);
  expect(consistency({...entry,openPuts:[{...p,contracts:2}]},previous,null).join(" ")).toContain("changed");
});
it("16 Nov entered guide state reproduces archived drawdown and zero exposures without using replay holdings as real data", async () => {
  const fixture = await readJson("tests/fixtures/v3_archived.json",ReplayFixtureSchema), last=fixture.days.at(-1)!;
  const peak=fixture.days.reduce((a,b)=>a.equity>b.equity?a:b), scale=100000/last.equity;
  const snapshots=[{...entry,date:peak.date,accountValue:100000/(1+last.dd)},{...entry,accountValue:last.equity*scale}];
  const features=await readJson("tests/fixtures/features.json",z.array(FeatureSchema)),rules=await readJson("config/rules/v3_1.json",RulesSchema);
  const run=analyzeRun({type:"final",timestamp:"2026-11-16T21:20:00Z",asOf:entry.date},features,rules,{},snapshots,[],[]);
  expect(last.dd).toBeCloseTo(-0.212482993431096,12); expect(run.account?.drawdown).toBeCloseTo(-0.212482993431096,12); expect(run.account?.coreWeight).toBe(0); expect(run.account?.putNotionalWeight).toBe(0); expect(run.gate?.state).toBe("OFF"); expect(run.account?.kill).toBe(false);
});
it("a snapshot correction blocks old recommendations on dashboards and the run API until rerun", async () => {
  const { currentAccountRun } = await import("../../src/portfolio/basis");
  const { GET: getRun } = await import("../../src/app/api/runs/route");
  const features=await readJson("tests/fixtures/features.json",z.array(FeatureSchema)),rules=await readJson("config/rules/v3_1.json",RulesSchema);
  const run=analyzeRun({type:"final",timestamp:"2026-11-16T21:20:00Z",asOf:entry.date},features,rules,{},[entry],[],[]);
  expect(currentAccountRun(run,[entry])?.freshness.actionsBlocked).toBe(false);
  const changed={...entry,shares:100};
  const blocked=currentAccountRun(run,[changed]);
  expect(blocked?.freshness.actionsBlocked).toBe(true); expect(blocked?.core).toBeNull(); expect(blocked?.put).toBeNull();
  const legacy={...run,working:{...run.working}}; delete legacy.working["account.snapshot"];
  expect(currentAccountRun(legacy,[entry])?.freshness.actionsBlocked).toBe(true);
  // Earlier NAV controls the peak/kill rule even when the current entry is unchanged.
  expect(currentAccountRun(run,[{...entry,date:"2026-11-13",accountValue:200000},entry])?.freshness.actionsBlocked).toBe(true);
  // Future records cannot invalidate a historical recommendation.
  expect(currentAccountRun(run,[entry,{...entry,date:"2026-11-17"}])?.freshness.actionsBlocked).toBe(false);
  await atomicWrite(path.join(root,"runs/last-attempt.json"),RunResultSchema,run);
  let state=await readPortfolio(root); state=await savePortfolio({operation:"snapshot",revision:state.revision,entry:changed},root,now);
  const req=request({});
  const response=await getRun(new Request(req.url,{headers:req.headers}));
  expect(response.status).toBe(200); expect((await response.json()).freshness.actionsBlocked).toBe(true);
  await atomicWrite(path.join(root,`runs/${entry.date}_final.json`),RunResultSchema,run);
  state=await savePortfolio({operation:"journal",revision:state.revision,date:entry.date,done:"Held",note:""},root,now);
  expect(state.journal.at(-1)?.runId).toBe("unconfirmed");
});
it("origin validation uses the original Host and rejects cross-origin browser writes", async () => {
  const { sameOrigin } = await import("../../src/auth/session");
  expect(sameOrigin(new Request("http://localhost:3100/api/portfolio",{headers:{host:"127.0.0.1:3100",origin:"http://127.0.0.1:3100"}}))).toBe(true);
  expect(sameOrigin(new Request("http://localhost:3100/api/portfolio",{headers:{host:"127.0.0.1:3100",origin:"http://evil.example"}}))).toBe(false);
});
it("reconciles a consecutive-session share count against the prior final estimate", async () => {
  const features=await readJson("tests/fixtures/features.json",z.array(FeatureSchema)),rules=await readJson("config/rules/v3_1.json",RulesSchema);
  const prior={...entry,date:"2026-10-19"};
  const run=analyzeRun({type:"final",timestamp:"2026-10-19T20:20:00Z",asOf:prior.date},features,rules,{},[prior],[],[]);
  const next={...entry,date:"2026-10-20",shares:run.core!.trade!.roundedQuantity};
  expect(consistency(next,prior,run).some(w=>w.includes("SOXL shares"))).toBe(false);
  expect(consistency({...next,shares:next.shares+1},prior,run).some(w=>w.includes("prior recommendation"))).toBe(true);
});
