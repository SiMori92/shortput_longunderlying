import { expect, it } from "vitest";
import raw from "../../config/monitors.json";
import { MonitorConfigsSchema, ObservationSchema, type Observation, type MonitorResult } from "../../src/schemas/monitor";
import { buildMonitor, monitorSeries, trackingSeries, unlockWindow } from "../../src/monitors/model";
import { sessions } from "../../src/market/calendar";
import type { Bar } from "../../src/engine/types";
const config=MonitorConfigsSchema.parse(raw)[0]!;
const dates=sessions("2026-01-02","2026-11-17");
function bars(ds=dates):Bar[]{return ds.map((date,i)=>{const close=100*Math.exp(i*.002+.008*Math.sin(i));return {date,open:close,high:close,low:close,close,adjclose:null,volume:100};});}
const facts:MonitorResult["facts"]=["launchDate","yahooSymbol","issuer","expenseRatio","listedOptions","aum","volume"].map(key=>({key:key as MonitorResult["facts"][number]["key"],value:"test-only",confirmed:true,source:"test fixture",asOf:dates.at(-1)!}));
const observation=(date:string):Observation=>({symbol:"SPAX",date,ivPercent:100,cadence:"weekly",bid:.95,ask:1.05,openInterest:500,delta:-.25,expiry:"2026-11-20",source:"synthetic test only"});
function monitor(overrides:Partial<Parameters<typeof buildMonitor>[0]>={}){return buildMonitor({config,reference:"SPCX",leverage:2,asset:bars(),referenceBars:bars(),asOf:dates.at(-1)!,observations:dates.slice(-20).map(observation),facts,dataStatus:"valid",warnings:[],...overrides});}
const check=(m:MonitorResult,id:string)=>m.checks.find(c=>c.id===id)!;
it("shows provisional history and honest missing SPAX stats without manufacturing closes",()=>{
 const m=monitor({asset:[],referenceBars:bars(dates.slice(-110))});expect(m.verdict).toBe("NOT READY");expect(check(m,"history").value).toBe(110);expect(check(m,"trend").status).toBe("provisional");expect(m.stats[0]!.price).toBeNull();expect(m.tracking).toEqual([]);expect(m.stats[1]!.sma50).not.toBeNull();expect(m.stats[1]!.sma200).toBeNull();
});
it("computes sample log volatility and rolling means independently",()=>{
 const p=monitorSeries(bars(),config).at(-1)!,values=bars().slice(-21).map(b=>b.close),rs=values.slice(1).map((v,i)=>Math.log(v/values[i]!)),mean=rs.reduce((a,b)=>a+b)/20;
 const independent=Math.sqrt(rs.reduce((s,r)=>s+(r-mean)**2,0)/19)*Math.sqrt(252);expect(p.rv20).toBeCloseTo(independent,13);
 expect(p.smaFast).toBeCloseTo(bars().slice(-50).reduce((s,b)=>s+b.close,0)/50,12);
});
it("requires strictly less than the volatility brake and handles zero volatility",()=>{
 const ratio=check(monitor(),"vol").value as number;
 expect(check(monitor({config:{...config,volBrake:ratio}}),"vol").status).toBe("fail");
 const flat=bars().map(b=>({...b,open:100,high:100,low:100,close:100}));const m=monitor({asset:flat});expect(check(m,"vol").status).toBe("unconfirmed");expect(m.ivRv).toBeNull();
});
it("counts consecutive NYSE IV observations over weekends and breaks at missing or stale days",()=>{
 expect(monitor().premiumStreak).toBe(20);
 const obs=dates.slice(-20).map(observation);obs.splice(-3,1);expect(monitor({observations:obs}).premiumStreak).toBe(2);
 expect(monitor({observations:dates.slice(-21,-1).map(observation)}).premiumStreak).toBe(0);
 expect(monitor({observations:[{...observation(dates.at(-1)!),ivPercent:.001}]}).premiumStreak).toBe(0);
});
it("accepts spread/OI/delta boundaries and rejects wide, expired or incomplete quotes",()=>{
 expect(check(monitor(),"options").status).toBe("pass");
 for(const patch of [{ask:1.06},{openInterest:499},{delta:-.251},{cadence:"none" as const},{expiry:dates.at(-1)!},{bid:0,ask:0}]) expect(check(monitor({observations:[{...observation(dates.at(-1)!),...patch}]}),"options").status).toBe("fail");
 expect(check(monitor({observations:[{...observation(dates.at(-1)!),delta:null}]}),"options").status).toBe("unconfirmed");
});
it("compounds daily leveraged reference returns, not double cumulative reference returns",()=>{
 const ds=dates.slice(-3),a=monitorSeries(bars(ds).map((b,i)=>({...b,close:[100,120,96][i]!})),config),r=monitorSeries(bars(ds).map((b,i)=>({...b,close:[100,110,99][i]!})),config);
 const t=trackingSeries(a,r,2);expect(t).toHaveLength(2);expect(t[1]!.leveragedGrowth).toBeCloseTo(-.04,12);expect(t[1]!.cumulativeGap).toBeCloseTo(0,12);expect(t[1]!.leveragedGrowth).not.toBeCloseTo(2*(99/100-1),8);
});
it("resets tracking across missing sessions and excludes future bars",()=>{
 const ds=dates.slice(-6),a=monitorSeries(bars(ds).filter((_,i)=>i!==2),config),r=monitorSeries(bars(ds),config);expect(trackingSeries(a,r,2).map(p=>p.date)).toEqual(ds.slice(-2));
 const asOf=dates.at(-3)!,m=monitor({asOf});expect(m.series.SPAX!.at(-1)!.date).toBe(asOf);expect(m.stats[0]!.count).toBe(dates.length-2);expect(m.premiumStreak).toBe(18);
});
it("uses pre-event baseline and 20 complete post-event returns including weekend anchors",()=>{
 const e={...config.unlocks[0]!,scheduled:"2026-10-17",confirmedDate:"2026-10-17",source:"https://example.test/source"};const series=monitorSeries(bars(),config),u=unlockWindow(e,series,"2026-11-17",20),post=sessions(e.scheduled,"2026-11-17").slice(0,20),base=series.find(p=>p.date==="2026-10-16")!.close,end=series.find(p=>p.date===post.at(-1))!.close;
 expect(u.confirmed).toBe(true);expect(u.completedSessions).toBe(20);expect(u.return20).toBeCloseTo(end/base-1,12);expect(u.vol20).toBeGreaterThan(0);
 expect(unlockWindow(e,series,"2026-10-16",20).return20).toBeNull();expect(unlockWindow(e,series.filter(p=>p.date!==post[5]),"2026-11-17",20).return20).toBeNull();
 expect(unlockWindow({...e,confirmedDate:null,source:null},series,"2026-11-17",20).confirmed).toBe(false);
});
it("requires all six checks, final validated data, identity and all facts for READY",()=>{
 const e={...config.unlocks[0]!,scheduled:"2026-10-01",confirmedDate:"2026-10-01",source:"https://example.test/source"},c={...config,unlocks:[e]};const m=monitor({config:c});expect(m.checks.map(c=>c.status)).toEqual(Array(6).fill("pass"));expect(m.verdict).toBe("READY TO BACKTEST");
 expect(monitor({config:c,facts:facts.map(f=>f.key==="issuer"?{...f,confirmed:false,value:"unconfirmed"}:f)}).verdict).toBe("WATCH");
 expect(check(monitor({config:c,facts:facts.map(f=>f.key==="listedOptions"?{...f,value:false}:f)}),"options").status).toBe("fail");
 expect(monitor({config:c,dataStatus:"provisional"}).verdict).toBe("NOT READY");expect(monitor().verdict).toBe("WATCH");
});
it("rejects malformed observations, calendar overflow, duplicate configs and inconsistent unlock evidence",()=>{
 expect(ObservationSchema.safeParse({...observation("2026-11-17"),bid:2,ask:1}).success).toBe(false);
 expect(ObservationSchema.safeParse({...observation("2026-11-17"),expiry:"2026-11-16"}).success).toBe(false);
 expect(MonitorConfigsSchema.safeParse([config,config]).success).toBe(false);
 expect(MonitorConfigsSchema.safeParse([{...config,unlocks:[{...config.unlocks[0],scheduled:"2030-01-01"}]}]).success).toBe(false);
 expect(MonitorConfigsSchema.safeParse([{...config,unlocks:[{...config.unlocks[0],source:"https://example.test"}]}]).success).toBe(false);
});
it("provides workings for every numeric result and supports a configured additional monitor",()=>{
 const m=monitor({config:{...config,symbol:"NVDL"},reference:"NVDA",leverage:2,observations:[]});expect(m.symbol).toBe("NVDL");expect(m.series.NVDA).toHaveLength(dates.length);
 function numeric(v:unknown,p=""){if(typeof v==="number")expect(m.working[p],p).toBeDefined();else if(v&&typeof v==="object")for(const[k,x]of Object.entries(v))if(k!=="working")numeric(x,p?`${p}.${k}`:k);}numeric(m);
});
