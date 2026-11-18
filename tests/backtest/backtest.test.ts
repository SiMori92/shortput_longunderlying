import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { readJson, atomicWrite } from "../../src/data/store";
import { seedData } from "../../src/data/seed";
import { loadBacktest, loadRules } from "../../src/backtest/load";
import { compareReplays, heatClass, periodCells, validateReplay } from "../../src/backtest/model";
import { ruleRows } from "../../src/backtest/rules";
import { BacktestResultSchema, ReplayFixtureSchema } from "../../src/schemas/backtest";
import { BarsSchema } from "../../src/schemas/bars";
import { RulesSchema } from "../../src/schemas/config";
let root:string;
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),"strategy-m7-"));await seedData(root);});
afterEach(async()=>{await rm(root,{recursive:true,force:true});});
it("uses Python first-observed-equity and prior period-close baselines without inventing missing months",()=>{
 const days=[{date:"2025-01-15",equity:100},{date:"2025-01-31",equity:110},{date:"2025-02-14",equity:99},{date:"2026-01-05",equity:198}];
 const m=periodCells(days,7),y=periodCells(days,4);expect(m.map(c=>c.period)).toEqual(["2025-01","2025-02","2026-01"]);expect(m[0]!.value).toBeCloseTo(.1);expect(m[1]!.value).toBeCloseTo(-.1);expect(m[2]!.fromDate).toBe("2025-02-14");expect(m[2]!.value).toBe(1);expect(y[0]!.value).toBeCloseTo(-.01);expect(y[1]!.value).toBe(1);expect(periodCells([],7)).toEqual([]);
});
it("seed fallback matches every Python monthly/yearly return, final equity and daily comparison for both rules",async()=>{
 const d=await loadBacktest(root);expect(d.origin).toBe("seed");expect(d.monthly).toHaveLength(107);expect(d.yearly).toHaveLength(9);
 for(const [id,r]of [["v3_1",d.live],["v3_archived",d.archived]]as const){const fixture=await readJson(`tests/fixtures/${id}.json`,ReplayFixtureSchema);expect(r.trades).toHaveLength(fixture.trades.length);expect(r.days.at(-1)!.equity).toBeCloseTo(fixture.days.at(-1)!.equity,6);for(const kind of ["monthly","yearly"]as const){expect(Object.keys(r[kind])).toEqual(Object.keys(fixture[kind]));for(const [key,value]of Object.entries(fixture[kind]))expect(r[kind][key],`${id} ${key}`).toBeCloseTo(value,10);}for(const key of ["CAGR","MDD","Sharpe","Calmar","WinRate"])expect(r.metrics[key]).toBeCloseTo(fixture.metrics[key] as number,10);}
 expect(d.monthly.at(-1)!.period).toBe("2026-11");expect(d.monthly.at(-1)!.toDate).toBe("2026-11-16");expect(d.yearly.at(-1)!.toDate).toBe("2026-11-16");
 const prices=await readJson(path.join(root,"bars/SOXL.json"),BarsSchema),first=prices.bars.find(b=>b.date===d.points[0]!.date)!.close;let peak=0;
 d.points.forEach((p,i)=>{expect(p.live).toBe(d.live.days[i]!.equity);const expected=prices.bars.find(b=>b.date===p.date)!.close/first*d.live.capital;peak=Math.max(peak,expected);expect(p.benchmark).toBe(expected);expect(p.benchmarkDD).toBeCloseTo(expected/peak-1,12);});expect(d.points[0]!.benchmark).toBe(1e6);
 const inputs=d.metricInputs;expect(inputs.Sharpe.meanExcess!/inputs.Sharpe.sampleStdDailyReturn!*Math.sqrt(252)).toBeCloseTo(d.live.metrics.Sharpe as number,12);expect(inputs.MDD.equity/inputs.MDD.peak-1).toBeCloseTo(d.live.metrics.MDD as number,12);
});
it("uses a complete matching nightly pair and does not replace corrupted or incomplete saved output with seed",async()=>{
 const d=await loadBacktest(root);await atomicWrite(path.join(root,"backtest/v3_1.json"),BacktestResultSchema,d.live);
 await expect(loadBacktest(root)).rejects.toThrow("Incomplete nightly pair");await atomicWrite(path.join(root,"backtest/v3_archived.json"),BacktestResultSchema,d.archived);const nightly=await loadBacktest(root);expect(nightly.origin).toBe("nightly");expect(nightly.metricInputs.Sharpe.meanExcess).toBeNull();
 await writeFile(path.join(root,"backtest/v3_1.json"),"{}");await expect(loadBacktest(root)).rejects.toThrow();
});
it("rejects mismatched replay windows, identity, chronology, and returns inconsistent with daily equity",async()=>{
 const d=await loadBacktest(root);expect(()=>compareReplays(d.live,{...d.archived,capital:2e6},[])).toThrow("windows");expect(()=>validateReplay(d.live,"v3_archived")).toThrow("identity");
 expect(()=>validateReplay({...d.live,monthly:{...d.live.monthly,"2018-01":.123}},"v3_1")).toThrow("period returns");
 expect(()=>validateReplay({...d.live,days:[d.live.days[1]!,d.live.days[0]!,...d.live.days.slice(2)]},"v3_1")).toThrow("chronology");
 expect(()=>validateReplay({...d.live,metrics:{...d.live.metrics,CAGR:"wrong"}},"v3_1")).toThrow("metric");
 expect(()=>validateReplay({...d.live,metrics:{...d.live.metrics,CAGR:99}},"v3_1")).toThrow("disagrees");
});
it("missing benchmark sessions make the full comparison unconfirmed instead of bridging gaps",async()=>{
 const d=await loadBacktest(root);await atomicWrite(path.join(root,"backtest/v3_1.json"),BacktestResultSchema,d.live);await atomicWrite(path.join(root,"backtest/v3_archived.json"),BacktestResultSchema,d.archived);
 await rm(path.join(root,"bars/SOXL.json"));const missing=await loadBacktest(root);expect(missing.points.every(p=>p.benchmark===null&&p.benchmarkDD===null)).toBe(true);expect(missing.benchmarkYearly).toEqual([]);
});
it("rejects invalid config and renders every rule key directly from current config",async()=>{
 const {live,archived}=await loadRules(root),rows=ruleRows(live);expect(rows.map(r=>r.key)).toEqual(Object.keys(live));expect(rows.every(r=>r.label&&r.formula)).toBe(true);expect(rows.find(r=>r.key==="profitTake")!.value).toBe(.7);expect(ruleRows(archived).find(r=>r.key==="gateMode")!.value).toBe("all-conditions");
 await atomicWrite(path.join(root,"config/rules/v3_1.json"),RulesSchema,{...live,coreCap:.27});expect(ruleRows((await loadRules(root)).live).find(r=>r.key==="coreCap")!.value).toBe(.27);
 await atomicWrite(path.join(root,"config/rules/archive/v3.json"),RulesSchema,live);await expect(loadRules(root)).rejects.toThrow("identities");
});
it("rejects unreadable nightly data and uses honest positive/negative/absent heatmap classes",async()=>{
 await mkdir(path.join(root,"backtest"),{recursive:true});await writeFile(path.join(root,"backtest/v3_1.json"),"{bad json");await expect(loadBacktest(root)).rejects.toThrow();
 expect([null,0,.01,.05,-.01,-.05].map(heatClass)).toEqual(["heat-empty","heat-flat","heat-positive","heat-positive-strong","heat-negative","heat-negative-strong"]);
});
