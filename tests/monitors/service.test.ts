import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seedData } from "../../src/data/seed";
import { atomicWrite } from "../../src/data/store";
import { readObservations, saveObservation, loadMonitors, MonitorConflict, UpdateStatusSchema } from "../../src/monitors/service";
import { GET, PUT } from "../../src/app/api/monitors/route";
import { updateMarket } from "../../src/market/update";
import { MarketFactsSchema } from "../../src/schemas/market";
import { UnderlyingsSchema } from "../../src/schemas/config";
import { MonitorConfigsSchema } from "../../src/schemas/monitor";
import monitorConfigs from "../../config/monitors.json";
import { attachMonitor } from "../../src/monitors/run";
import { RunResultSchema } from "../../src/schemas/run";
import { BarsSchema } from "../../src/schemas/bars";
import { SESSION_COOKIE } from "../../src/auth/session";
let root:string;
const secret="m6-test-only-secret-at-least-thirty-two-bytes",now=new Date("2026-11-18T22:00:00Z");
const observation={symbol:"SPAX",date:"2026-11-17",ivPercent:80,cadence:"weekly",bid:.95,ask:1.05,openInterest:500,delta:-.2,expiry:"2026-11-20",source:"Test only"};
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),"strategy-m6-"));await seedData(root);vi.stubEnv("DATA_DIR",root);vi.stubEnv("SESSION_SECRET",secret);});
afterEach(async()=>{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});
function request(input:unknown,extra:Record<string,string>={}){const body=Buffer.from(JSON.stringify({user:"owner",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");return new Request("https://monitor.example/api/monitors",{method:"PUT",headers:{cookie:`${SESSION_COOKIE}=${body}.${createHmac("sha256",secret).update(body).digest("base64url")}`,origin:"https://monitor.example","content-type":"application/json",...extra},body:JSON.stringify(input)});}
it("initializes monitor files, preserves saved observations and upserts by symbol/date",async()=>{
 let s=await readObservations(root);expect(s.observations).toEqual([]);s=await saveObservation({revision:s.revision,observation},root,now);s=await saveObservation({revision:s.revision,observation:{...observation,ivPercent:90}},root,now);
 await seedData(root);expect((await readObservations(root)).observations).toEqual([{...observation,ivPercent:90}]);
 expect(JSON.parse(await readFile(path.join(root,"monitors/observations.json"),"utf8"))).toHaveLength(1);
});
it("rejects simultaneous writes, stale revisions and process locks without data loss",async()=>{
 const s=await readObservations(root),cmd={revision:s.revision,observation},results=await Promise.allSettled([saveObservation(cmd,root,now),saveObservation(cmd,root,now)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 await expect(saveObservation(cmd,root,now)).rejects.toBeInstanceOf(MonitorConflict);
 await writeFile(path.join(root,"monitors/.write.lock"),"");await expect(saveObservation({...cmd,revision:(await readObservations(root)).revision},root,now)).rejects.toBeInstanceOf(MonitorConflict);expect((await readObservations(root)).observations).toHaveLength(1);
});
it("protects API auth, origin, strict schema, media type, size, symbols and session dates",async()=>{
 const s=await readObservations(root),cmd={revision:s.revision,observation};expect((await GET(new Request("https://monitor.example/api/monitors"))).status).toBe(401);
 expect((await PUT(request(cmd,{cookie:""}))).status).toBe(401);expect((await PUT(request(cmd,{origin:"https://evil.example"}))).status).toBe(403);expect((await PUT(request(cmd,{"content-type":"text/plain"}))).status).toBe(415);
 for(const patch of [{date:"2026-11-15"},{date:"2099-01-01"},{symbol:"SOXL"},{expiry:"2026-11-21"},{ask:.1},{delta:-2}])expect((await PUT(request({...cmd,observation:{...observation,...patch}}))).status).toBe(400);
 expect((await PUT(request({...cmd,rogue:true}))).status).toBe(400);expect((await PUT(request({...cmd,padding:"x".repeat(20000)}))).status).toBe(400);
 expect((await PUT(request(cmd))).status).toBe(200);expect((await PUT(request(cmd))).status).toBe(409);expect((await GET(request(cmd))).status).toBe(200);
});
it("loads real seed reference history and honest missing SPAX data without asserting readiness",async()=>{
 const {results}=await loadMonitors({root,asOf:"2026-11-16"}),m=results[0]!;expect(m.reference).toBe("SPCX");expect(m.stats[1]!.count).toBe(98);expect(m.stats[0]!.count).toBe(0);expect(m.verdict).toBe("NOT READY");expect(m.dataStatus).toBe("unconfirmed");expect(m.facts.every(f=>!f.confirmed)).toBe(true);expect(m.expectedHistoryDate).toBe("2027-03-31");
 // Independent pandas/numpy recomputation of bundled raw closes (ddof=1).
 expect(m.stats[1]!.price).toBe(134.72000122070312);expect(m.stats[1]!.sma50).toBeCloseTo(149.56140075683595,11);expect(m.stats[1]!.rv20).toBeCloseTo(.6378793381263164,12);expect(m.stats[1]!.drawdown).toBeCloseTo(-.36269453801180984,12);
});
it("rejects identity mismatches and corrupt manual storage at the file boundary",async()=>{
 const b=BarsSchema.parse(JSON.parse(await readFile(path.join(root,"bars/SPCX.json"),"utf8")));await atomicWrite(path.join(root,"bars/SPAX.json"),BarsSchema,b);await expect(loadMonitors({root,asOf:"2026-11-16"})).rejects.toThrow("symbol mismatch");
 await rm(path.join(root,"bars/SPAX.json"));await writeFile(path.join(root,"monitors/observations.json"),"{}");await expect(loadMonitors({root,asOf:"2026-11-16"})).rejects.toThrow();
});
it("requires matching final statuses and complete sessions, never extrapolates data freshness",async()=>{
 const b=BarsSchema.parse(JSON.parse(await readFile(path.join(root,"bars/SPCX.json"),"utf8")));await atomicWrite(path.join(root,"bars/SPAX.json"),BarsSchema,{...b,symbol:"SPAX"});
 const symbols=["SPAX","SPCX"].map(symbol=>({symbol,lastDate:"2026-10-30",expectedDate:"2026-10-30",count:b.bars.length,provisional:false,updated:true,issues:[]}));await atomicWrite(path.join(root,"updates/latest.json"),UpdateStatusSchema,{timestamp:"2026-11-16T22:00:00Z",asOf:"2026-10-30",symbols});
 expect((await loadMonitors({root,asOf:"2026-10-30"})).results[0]!.dataStatus).toBe("valid");
 expect((await loadMonitors({root,asOf:"2026-10-30",preview:true})).results[0]!.dataStatus).toBe("provisional");
 const missing={...b,symbol:"SPAX",bars:b.bars.filter((_,i)=>i!==50)};await atomicWrite(path.join(root,"bars/SPAX.json"),BarsSchema,missing);symbols[0]!.count--;await atomicWrite(path.join(root,"updates/latest.json"),UpdateStatusSchema,{timestamp:"2026-11-16T22:00:00Z",asOf:"2026-10-30",symbols});
 const m=(await loadMonitors({root,asOf:"2026-10-30"})).results[0]!;expect(m.dataStatus).toBe("unconfirmed");expect(m.warnings.join(" ")).toContain("missing NYSE sessions");
});

it("attaches validated monitor results and numeric workings to preview/final run JSON",async()=>{
 const run=RunResultSchema.parse(JSON.parse(await readFile("tests/fixtures/market/blocked-run.json","utf8"))),monitor=(await loadMonitors({root,asOf:"2026-11-16"})).results[0]!;
 const result=attachMonitor(run,monitor);expect(result.spax.monitor?.checks).toHaveLength(6);expect(result.working["spax.monitor.stats.1.count"]!.result).toBe(98);expect(result.spax.monitor?.verdict).toBe("NOT READY");
});
it("uses configured identity terms for future monitors and rejects a wrong ETF identity",async()=>{
 await atomicWrite(path.join(root,"config/underlyings.json"),UnderlyingsSchema,[{symbol:"NVDL",role:"monitor",leverage:2,reference:"NVDA",seedFile:null}]);
 await atomicWrite(path.join(root,"config/monitors.json"),MonitorConfigsSchema,[{...monitorConfigs[0],symbol:"NVDL",identityTerms:["2X","NVDA"]}]);
 let name="Unrelated ETF";
 const fetcher:typeof fetch=async()=>Response.json({chart:{error:null,result:[{meta:{symbol:"NVDL",exchangeTimezoneName:"America/New_York",longName:name,instrumentType:"ETF"},timestamp:[Date.parse("2026-11-17T14:30:00Z")/1000],indicators:{quote:[{open:[10],high:[10],low:[10],close:[10],volume:[100]}]}}]}});
 const options={root,now:new Date("2026-11-17T22:00:00Z"),asOf:"2026-11-17",preview:false,fetcher};await updateMarket(options);
 let facts=MarketFactsSchema.parse(JSON.parse(await readFile(path.join(root,"facts/NVDL.json"),"utf8")));expect(facts.yahooSymbol).toBe("unconfirmed");name="Daily 2X NVDA ETF";await updateMarket(options);facts=MarketFactsSchema.parse(JSON.parse(await readFile(path.join(root,"facts/NVDL.json"),"utf8")));expect(facts.yahooSymbol).toMatchObject({value:"NVDL"});expect(facts.issuer).toBe("unconfirmed");
});
