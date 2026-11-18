import type { Bar } from "../engine/types";
import { realizedVolatility, rollingMean, sampleStd } from "../engine/statistics";
import { calendarDays, shiftDate } from "../engine/dates";
import { previousSession, sessions } from "../market/calendar";
import { MonitorResultSchema, type MonitorConfig, type MonitorResult, type Observation } from "../schemas/monitor";
import type { z } from "zod";
import type { FactViewSchema, MonitorPointSchema } from "../schemas/monitor";
type Point=z.infer<typeof MonitorPointSchema>;
export function monitorSeries(bars: readonly Bar[], config: MonitorConfig): Point[] {
  const values=bars.map(b=>b.close),fast=rollingMean(values,config.smaFast),slow=rollingMean(values,config.smaSlow),rv10=realizedVolatility(values,10),rv20=realizedVolatility(values,20),rv60=realizedVolatility(values,60);
  let peak=0;
  return bars.map((b,i)=>({date:b.date,close:b.close,smaFast:fast[i]!,smaSlow:slow[i]!,rv10:rv10[i]!,rv20:rv20[i]!,rv60:rv60[i]!,peak:peak=Math.max(peak,b.close)}));
}
/** Daily comparisons require both adjacent session closes; never compare across a gap. */
export function trackingSeries(asset: readonly Point[], reference: readonly Point[], leverage: number) {
  const a=new Map(asset.map(p=>[p.date,p.close])),r=new Map(reference.map(p=>[p.date,p.close]));
  let actualGrowth=1,leveragedGrowth=1;
  const points: MonitorResult["tracking"]=[];
  const common=asset.filter(p=>r.has(p.date));
  for (let i=1;i<common.length;i++) {
    const date=common[i]!.date,prev=previousSession(date);
    // Reset at a missing session: a cumulative gap across a discontinuity is misleading.
    if (!a.has(prev)||!r.has(prev)||common[i-1]!.date!==prev) { actualGrowth=1;leveragedGrowth=1;points.length=0;continue; }
    const actual=a.get(date)!/a.get(prev)!-1,leveragedReference=leverage*(r.get(date)!/r.get(prev)!-1);
    actualGrowth*=1+actual;leveragedGrowth*=1+leveragedReference;
    points.push({date,actual,leveragedReference,dailyGap:actual-leveragedReference,actualGrowth:actualGrowth-1,leveragedGrowth:leveragedGrowth-1,cumulativeGap:actualGrowth-leveragedGrowth});
  }
  return points;
}
export function unlockWindow(event: MonitorConfig["unlocks"][number], reference: readonly Point[], asOf:string, n:number): MonitorResult["unlocks"][number] {
  const anchor=event.confirmedDate??event.scheduled, baselineDate=previousSession(anchor),map=new Map(reference.map(p=>[p.date,p.close]));
  const elapsed=asOf>=anchor?sessions(anchor,asOf):[],target=elapsed.slice(0,n),complete=target.length===n&&map.has(baselineDate)&&target.every(d=>map.has(d));
  const prices=complete?[map.get(baselineDate)!,...target.map(d=>map.get(d)!)]:[];
  const returns=prices.slice(1).map((p,i)=>Math.log(p/prices[i]!));
  return {id:event.id,label:event.label,scheduled:event.scheduled,actualDate:event.confirmedDate,fraction:event.fraction,days:calendarDays(asOf,anchor),confirmed:event.confirmedDate!==null&&event.source!==null,completedSessions:target.filter(d=>map.has(d)).length,windowEnd:complete?target.at(-1)!:null,return20:complete?prices.at(-1)!/prices[0]!-1:null,vol20:complete?sampleStd(returns)*Math.sqrt(252):null};
}
export function buildMonitor(input:{config:MonitorConfig;reference:string;leverage:number;asset:readonly Bar[];referenceBars:readonly Bar[];asOf:string;observations:readonly Observation[];facts:z.infer<typeof FactViewSchema>[];dataStatus:MonitorResult["dataStatus"];warnings:string[]}): MonitorResult {
  const {config:c,reference,leverage,asOf}=input;
  const asset=input.asset.filter(b=>b.date<=asOf),ref=input.referenceBars.filter(b=>b.date<=asOf),a=monitorSeries(asset,c),r=monitorSeries(ref,c),last=a.at(-1),refLast=r.at(-1);
  const observations=new Map(input.observations.filter(o=>o.symbol===c.symbol&&o.date<=asOf).map(o=>[o.date,o])),byDate=new Map(a.map(p=>[p.date,p]));
  const observation=observations.get(asOf),rv=last?.[`rv${c.rvWindow}`]??null;
  const ivRv=observation?.ivPercent!=null&&rv!==null&&rv>0&&last?.date===asOf?observation.ivPercent/100/rv:null;
  let premiumStreak=0,date=asOf;
  while (true) {
    const o=observations.get(date),p=byDate.get(date),value=p?.[`rv${c.rvWindow}`];
    if (o?.ivPercent==null||value==null||value<=0||o.ivPercent/100/value<c.premiumRatio) break;
    premiumStreak++;if(date<="2010-01-04")break;date=previousSession(date);
  }
  const ratio=last?.rv10!=null&&last.rv60!=null&&last.rv60>0?last.rv10/last.rv60:null;
  const mid=observation?.bid!=null&&observation.ask!=null?(observation.bid+observation.ask)/2:null;
  const spreadRatio=mid!==null&&mid>0?(observation!.ask!-observation!.bid!)/mid:null;
  const optionsKnown=observation?.cadence!==undefined&&observation.cadence!=="unconfirmed"&&observation.bid!==null&&observation.ask!==null&&observation.openInterest!==null&&observation.delta!==null&&observation.expiry!==null;
  const noListedOptions=input.facts.some(f=>f.key==="listedOptions"&&f.confirmed&&f.value===false);
  const optionsPass=optionsKnown&&!noListedOptions&&(observation.cadence==="weekly"||observation.cadence==="biweekly")&&spreadRatio!==null&&spreadRatio<=c.maxSpread+1e-12&&observation.openInterest!>=c.minOpenInterest&&Math.abs(Math.abs(observation.delta!)-c.targetDelta)<=c.deltaTolerance+1e-12&&observation.expiry!>asOf;
  const unlocks=c.unlocks.map(e=>unlockWindow(e,r,asOf,c.postUnlockSessions));
  // No configured unlock events (e.g. a mature ETF like SOXL): nothing to digest.
  const noUnlocks=c.unlocks.length===0,knownUnlocks=unlocks.length>0&&unlocks.every(u=>u.confirmed),digested=noUnlocks||knownUnlocks&&unlocks.every(u=>u.return20!==null&&u.vol20!==null);
  const trendKnown=refLast?.smaSlow!=null&&refLast.smaFast!==null;
  const checks: MonitorResult["checks"]=[
    {id:"history",status:ref.length>=c.historySessions?"pass":"fail",value:ref.length,detail:`${reference} ${ref.length}/${c.historySessions} stored sessions · ${c.symbol} ${asset.length}`},
    {id:"trend",status:trendKnown?(refLast.close>refLast.smaSlow!&&refLast.smaFast!>refLast.smaSlow!?"pass":"fail"):"provisional",value:refLast?.smaSlow??null,detail:trendKnown?`${reference} price > SMA${c.smaSlow} and SMA${c.smaFast} > SMA${c.smaSlow}`:`Provisional SMA${c.smaFast} and IPO comparison; SMA${c.smaSlow} unavailable`},
    {id:"vol",status:ratio===null?"unconfirmed":ratio<c.volBrake?"pass":"fail",value:ratio,detail:`${c.symbol} RV10/RV60 < ${c.volBrake}; equality fails`},
    {id:"premium",status:ivRv===null?"unconfirmed":premiumStreak>=c.premiumSessions?"pass":"fail",value:premiumStreak,detail:`Manual IV/RV${c.rvWindow} ≥ ${c.premiumRatio} for ${c.premiumSessions} consecutive NYSE sessions`},
    {id:"options",status:noListedOptions||observation?.cadence==="none"?"fail":!optionsKnown?"unconfirmed":optionsPass?"pass":"fail",value:spreadRatio,detail:`Weekly/biweekly · spread ≤ ${(c.maxSpread*100).toFixed(0)}% · OI ≥ ${c.minOpenInterest} · |Δ| ${c.targetDelta} ± ${c.deltaTolerance}`},
    {id:"unlocks",status:digested?"pass":knownUnlocks?"fail":"unconfirmed",value:unlocks.filter(u=>u.confirmed&&u.return20!==null).length,detail:noUnlocks?"No unlock events configured for this instrument":`Actual dates need sourced confirmation; then ${c.postUnlockSessions} complete post-event sessions`},
  ];
  const identity=input.facts.find(f=>f.key==="yahooSymbol")?.confirmed===true;
  const prerequisites=ref.length>=c.historySessions&&input.dataStatus==="valid"&&identity;
  const allFacts=input.facts.every(f=>f.confirmed);
  const verdict:MonitorResult["verdict"]=!prerequisites?"NOT READY":checks.every(ch=>ch.status==="pass")&&allFacts?"READY TO BACKTEST":"WATCH";
  const stats=([ [c.symbol,a,null], [reference,r,c.ipoPrice] ] as const).map(([symbol,series,ipo])=>{
    const first=series[0],end=series.at(-1);
    return {symbol,count:series.length,firstDate:first?.date??null,lastDate:end?.date??null,price:end?.close??null,rv10:end?.rv10??null,rv20:end?.rv20??null,rv60:end?.rv60??null,drawdown:end?end.close/end.peak-1:null,returnSinceFirst:end&&first?end.close/first.close-1:null,sma50:end?.smaFast??null,sma200:end?.smaSlow??null,ipoReturn:end&&ipo?end.close/ipo-1:null,peak:end?.peak??null};
  });
  const remaining=Math.max(0,c.historySessions-ref.length),projectionStart=refLast?.date??asOf,futureEnd=`${Math.min(2028,Number(asOf.slice(0,4))+2)}-12-31`;
  const future=remaining&&futureEnd>projectionStart?sessions(shiftDate(projectionStart,1),futureEnd):[];
  const expectedHistoryDate=remaining===0?ref[c.historySessions-1]?.date??null:future[remaining-1]??null;
  const warnings=[...input.warnings,...(!allFacts?["Instrument facts remain unconfirmed; readiness cannot be certified."]:[]),...(c.unlocks.some(u=>!u.confirmedDate)?["Unlock dates and percentages are approximate user-brief inputs, not verified events."]:[])];
  const result={symbol:c.symbol,reference,leverage,asOf,dataStatus:input.dataStatus,warnings,verdict,checks,facts:input.facts,stats,series:{[c.symbol]:a,[reference]:r},tracking:trackingSeries(a,r,leverage),unlocks,premiumStreak,ivRv,spreadRatio,expectedHistoryDate,working:{}};
  const working: MonitorResult["working"]={};
  function work(key:string,formula:string,inputs:Record<string,number|string|boolean|null>,value:number|string|boolean|null) {working[key]={formula,inputs,result:value};}
  work("premiumStreak",`Consecutive NYSE sessions with manual IV / RV${c.rvWindow} >= premiumRatio; missing entry breaks streak`,{premiumRatio:c.premiumRatio,asOf},premiumStreak);
  work("ivRv",`(manual IV percent / 100) / RV${c.rvWindow}`,{ivPercent:observation?.ivPercent??null,rv},ivRv);
  work("spreadRatio","(ask-bid)/((ask+bid)/2)",{bid:observation?.bid??null,ask:observation?.ask??null},spreadRatio);
  work("leverage","Configured daily leverage; identity requires provider verification",{symbol:c.symbol},leverage);
  for (const [i,s] of stats.entries()) for (const [key,value] of Object.entries(s)) if (typeof value==="number") {
    const formula=key.startsWith("rv")?`sample std(log(close[t]/close[t-1]), ${key.slice(2)}, ddof=1) × sqrt(252)`:key==="drawdown"?"latest close / running peak - 1":key==="returnSinceFirst"?"latest close / first stored close - 1 (listing date unconfirmed)":key==="ipoReturn"?"latest reference close / configured IPO price - 1; provisional":key==="sma50"?`mean(last ${c.smaFast} closes)`:key==="sma200"?`mean(last ${c.smaSlow} closes)`:key==="count"?"count(stored bars through asOf)":key==="peak"?"max(stored closes through asOf)":"Latest stored close";
    work(`stats.${i}.${key}`,formula,{symbol:s.symbol,date:s.lastDate,price:s.price,peak:s.peak,firstPrice:(i?r:a)[0]?.close??null,ipoPrice:c.ipoPrice,...(key.startsWith("rv")||key.startsWith("sma")?{closes:JSON.stringify((i?r:a).slice(-(key.startsWith("rv")?Number(key.slice(2))+1:key==="sma50"?c.smaFast:c.smaSlow)).map(p=>p.close))}:{})},value);
  }
  // Every numeric chart/check leaf carries a reproducible formula for persisted runs.
  function annotate(value:unknown,prefix:string) {
    if (typeof value==="number"&&!working[prefix]) {
      const formula=prefix.startsWith("tracking.")?"actual=S_t/S_prev-1; leveragedReference=L*(REF_t/REF_prev-1); growth=product(1+r)-1; cumulativeGap=actualGrowth-leveragedGrowth; reset at gaps":prefix.startsWith("unlocks.")?"Days are calendar days from asOf; post-event return uses previous-session baseline and first N complete NYSE returns; vol=sample std(log returns)*sqrt(252)":prefix.startsWith("series.")?"Stored close; rolling arithmetic SMA; RVn=sample std of n log returns * sqrt(252); peak=running max(close)":"Checklist value derived from configured thresholds and observed daily data";
      work(prefix,formula,{asOf,leverage,rvWindow:c.rvWindow,postUnlockSessions:c.postUnlockSessions},value);
    } else if(value&&typeof value==="object") for(const [k,v] of Object.entries(value)) if(k!=="working") annotate(v,prefix?`${prefix}.${k}`:k);
  }
  annotate(result,"");
  for(const [symbol,series] of Object.entries(result.series))for(const [i,p] of series.entries())for(const [key,value]of Object.entries(p))if(typeof value==="number"){
    const n=key.startsWith("rv")?Number(key.slice(2)):key==="smaFast"?c.smaFast:key==="smaSlow"?c.smaSlow:0;
    work(`series.${symbol}.${i}.${key}`,key.startsWith("rv")?`sample std of ${n} log returns (ddof=1) × sqrt(252)`:n?`mean(last ${n} closes)`:key==="peak"?"max(closes through this session)":"Stored raw close",{symbol,date:p.date,...(n?{closes:JSON.stringify(series.slice(Math.max(0,i-n+(key.startsWith("rv")?0:1)),i+1).map(p=>p.close))}:key==="peak"?{previousPeak:series[i-1]?.peak??null,close:p.close}:{close:p.close})},value);
  }
  for(const [i,p]of result.tracking.entries()){
    const prev=previousSession(p.date),prior=result.tracking[i-1];
    const inputs={date:p.date,previousSession:prev,assetClose:a.find(x=>x.date===p.date)!.close,assetPrevious:a.find(x=>x.date===prev)!.close,referenceClose:r.find(x=>x.date===p.date)!.close,referencePrevious:r.find(x=>x.date===prev)!.close,leverage,previousActualGrowth:prior?.actualGrowth??0,previousLeveragedGrowth:prior?.leveragedGrowth??0};
    for(const[key,value]of Object.entries(p))if(typeof value==="number")work(`tracking.${i}.${key}`,"actual=assetClose/assetPrevious-1; leveraged=L*(referenceClose/referencePrevious-1); growth=(1+previousGrowth)*(1+dailyReturn)-1; cumulativeGap=actualGrowth-leveragedGrowth",inputs,value);
  }
  return MonitorResultSchema.parse({...result,working});
}
