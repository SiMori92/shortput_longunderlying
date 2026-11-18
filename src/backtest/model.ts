import { z } from "zod";
import { DateSchema, NumberSchema } from "../schemas/common";
import { BacktestResultSchema } from "../schemas/backtest";
import type { Bar } from "../engine/types";
const N=NumberSchema;
export const ComparisonPointSchema=z.strictObject({date:DateSchema,live:N,archived:N,benchmark:N.nullable(),liveDD:N,archivedDD:N,benchmarkDD:N.nullable()});
export const PeriodCellSchema=z.strictObject({period:z.string(),value:N,fromDate:DateSchema,toDate:DateSchema,fromEquity:N,toEquity:N});
export type PeriodCell=z.infer<typeof PeriodCellSchema>;
export type BacktestResult=z.infer<typeof BacktestResultSchema>;
export type ComparisonPoint=z.infer<typeof ComparisonPointSchema>;
/** Identical baseline to Python: first observed equity, then prior period close. */
export function periodCells(days:readonly {date:string;equity:number}[],size:4|7):PeriodCell[]{
 if(!days.length)return [];
 let baseline=days[0]!;const ends=new Map<string,{date:string;equity:number}>();
 for(const d of days)ends.set(d.date.slice(0,size),d);
 return [...ends].map(([period,end])=>{const cell={period,value:end.equity/baseline.equity-1,fromDate:baseline.date,toDate:end.date,fromEquity:baseline.equity,toEquity:end.equity};baseline=end;return PeriodCellSchema.parse(cell);});
}
export function validateReplay(raw:unknown,id:BacktestResult["rulesId"]):BacktestResult{
 const r=BacktestResultSchema.parse(raw);
 if(r.rulesId!==id||r.capital<=0||!r.days.length||r.start>r.end)throw new Error("Invalid replay identity/window");
 r.days.forEach((d,i)=>{if(d.date<r.start||d.date>r.end||d.equity<=0||(i>0&&d.date<=r.days[i-1]!.date))throw new Error("Invalid replay chronology/equity");});
 for(const [size,values]of [[4,r.yearly],[7,r.monthly]]as const){const cells=periodCells(r.days,size);if(cells.length!==Object.keys(values).length||cells.some(c=>values[c.period]===undefined||Math.abs(values[c.period]!-c.value)>1e-10))throw new Error("Stored period returns disagree with daily equity");}
 for(const key of ["CAGR","MDD","Sharpe","Calmar","WinRate"]){const v=r.metrics[key];if(v!==undefined&&v!==null&&typeof v!=="number")throw new Error(`Invalid replay metric ${key}`);}
 const first=r.days[0]!,last=r.days.at(-1)!,years=(Date.parse(last.date)-Date.parse(first.date))/86400000/365.25;
 let peak=first.equity,mdd=0;for(const d of r.days){peak=Math.max(peak,d.equity);mdd=Math.min(mdd,d.equity/peak-1);}
 const cagr=(last.equity/first.equity)**(1/years)-1;
 const expected:Record<string,number>={CAGR:cagr,MDD:mdd,Calmar:cagr/Math.abs(mdd),WinRate:r.trades.filter(t=>t.pnl>0).length/r.trades.length};
 for(const [key,value]of Object.entries(expected)){const given=r.metrics[key];if(typeof given==="number"&&(!Number.isFinite(value)||Math.abs(given-value)>1e-9*Math.max(1,Math.abs(value))))throw new Error(`Stored metric ${key} disagrees with replay`);}
 return r;
}
export function compareReplays(live:BacktestResult,archived:BacktestResult,bars:readonly Bar[]):ComparisonPoint[]{
 if(live.start!==archived.start||live.end!==archived.end||live.capital!==archived.capital||live.days.length!==archived.days.length||live.days.some((d,i)=>d.date!==archived.days[i]!.date))throw new Error("Replay comparison windows do not match");
 const prices=new Map(bars.map(b=>[b.date,b.close])),base=prices.get(live.days[0]!.date);
 // A partial benchmark would compound across gaps and hide missing history.
 const complete=base!==undefined&&base>0&&live.days.every(d=>(prices.get(d.date)??0)>0);
 let lp=0,ap=0,bp=0;
 return live.days.map((d,i)=>{const a=archived.days[i]!.equity,b=complete?prices.get(d.date)!/base!*live.capital:null;lp=Math.max(lp,d.equity);ap=Math.max(ap,a);if(b!==null)bp=Math.max(bp,b);
 return ComparisonPointSchema.parse({date:d.date,live:d.equity,archived:a,benchmark:b,liveDD:d.equity/lp-1,archivedDD:a/ap-1,benchmarkDD:b!==null?b/bp-1:null});});
}
export function metricValue(replay:BacktestResult,key:string):number|null{const v=replay.metrics[key];return typeof v==="number"?v:null;}
export function heatClass(value:number|null){return value===null?"heat-empty":value===0?"heat-flat":value>0?(value>=.05?"heat-positive-strong":"heat-positive"):(value<=-.05?"heat-negative-strong":"heat-negative");}
/** Exact scalar inputs for KPI workings; stored files do not record historical RF. */
export function metricInputs(result:BacktestResult,rf:ReadonlyMap<string,number>|null=null){
 const ds=result.days,first=ds[0]!,last=ds.at(-1)!,returns=ds.slice(1).map((d,i)=>d.equity/ds[i]!.equity-1);
 const avg=returns.length?returns.reduce((s,r)=>s+r,0)/returns.length:null;
 const std=avg!==null&&returns.length>1?Math.sqrt(returns.reduce((s,r)=>s+(r-avg)**2,0)/(returns.length-1)):null;
 const excess=rf&&ds.slice(1).every(d=>rf.has(d.date))?ds.slice(1).map((d,i)=>returns[i]!-rf.get(d.date)!/252):null;
 let peak=first.equity,worst={date:first.date,equity:first.equity,peak,drawdown:0};
 for(const d of ds){peak=Math.max(peak,d.equity);if(d.equity/peak-1<worst.drawdown)worst={date:d.date,equity:d.equity,peak,drawdown:d.equity/peak-1};}
 return {
  CAGR:{firstEquity:first.equity,lastEquity:last.equity,calendarDays:(Date.parse(last.date)-Date.parse(first.date))/86400000,daysPerYear:365.25},
  MDD:{date:worst.date,equity:worst.equity,peak:worst.peak},
  Sharpe:{meanExcess:excess?.length?excess.reduce((s,r)=>s+r,0)/excess.length:null,sampleStdDailyReturn:std,annualSessions:252,riskFreeInputs:rf?"Seed features: IRX/100, original left join and forward fill":"Unconfirmed: historical RF inputs not stored in nightly replay"},
  Calmar:{CAGR:metricValue(result,"CAGR"),MDD:metricValue(result,"MDD")},
  WinRate:{wins:result.trades.filter(t=>t.pnl>0).length,closedPuts:result.trades.length},
 };
}
