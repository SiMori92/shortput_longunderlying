import path from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { dataRoot, isMissing, readJson } from "../data/store";
import { parseSeedCsv } from "../data/seed";
import { BarsSchema } from "../schemas/bars";
import { RulesSchema } from "../schemas/config";
import { BacktestResultSchema } from "../schemas/backtest";
import { buildFeatures, replay, summarize, type History } from "../engine";
import { compareReplays, metricInputs, periodCells, validateReplay, type BacktestResult } from "./model";
import { KnownSplitsSchema } from "../schemas/market";
import { DEFAULT_STRATEGY, STRATEGIES, strategySymbols, type StrategySymbol } from "../strategy/symbols";
import { strategyRoot, strategyRules } from "../strategy/paths";
/** Thrown when a ticker has too little stored history for a single warmed-up model day. */
export class InsufficientHistoryError extends Error {}
export async function loadRules(root=dataRoot()){
 const [live,archived]=await Promise.all([readJson(path.join(root,"config/rules/v3_1.json"),RulesSchema),readJson(path.join(root,"config/rules/archive/v3.json"),RulesSchema)]);
 if(live.id!=="v3_1"||live.archived||live.gateMode!=="risk-cut"||archived.id!=="v3_archived"||!archived.archived||archived.gateMode!=="all-conditions")throw new Error("Live/archive rule identities do not match");
 return {live,archived};
}
async function stored(file:string){try{return await readJson(file,BacktestResultSchema);}catch(e){if(isMissing(e))return null;throw e;}}
export async function loadBacktest(root=dataRoot(),source=process.cwd(),symbol:StrategySymbol=DEFAULT_STRATEGY){
 const shared=await loadRules(root),dir=strategyRoot(root,symbol),{reference}=STRATEGIES[symbol];
 const knownSplits=symbol===DEFAULT_STRATEGY?{}:await readJson(path.join(root,"config/known-splits.json"),KnownSplitsSchema);
 const rules={live:strategyRules(shared.live,symbol,knownSplits),archived:strategyRules(shared.archived,symbol,knownSplits)};
 const saved=await Promise.all([stored(path.join(dir,"backtest/v3_1.json")),stored(path.join(dir,"backtest/v3_archived.json"))]);
 let rf:Map<string,number>|null=null;
 let live:BacktestResult,archived:BacktestResult,bars:z.infer<typeof BarsSchema>["bars"],origin:"nightly"|"seed"|"stored";
 if(saved[0]||saved[1]){
  if(!saved[0]||!saved[1])throw new Error("Incomplete nightly pair; repair the stored replays");
  live=validateReplay(saved[0],"v3_1");archived=validateReplay(saved[1],"v3_archived");origin="nightly";
  try{const b=await readJson(path.join(root,`bars/${symbol}.json`),BarsSchema);if(b.symbol!==symbol)throw new Error("Benchmark symbol mismatch");bars=b.bars;}catch(e){if(!isMissing(e))throw e;bars=[];}
 }else{
  // SOXL falls back to the bundled seed CSVs; other tickers replay their stored (validated) bars.
  origin=symbol===DEFAULT_STRATEGY?"seed":"stored";
  const symbols=strategySymbols(symbol);
  const history:History=Object.fromEntries(await Promise.all(symbols.map(async s=>{
   if(origin==="seed")return [s,parseSeedCsv(await readFile(path.join(source,"seed/bars",`${s}.csv`),"utf8"),s).bars];
   try{const b=await readJson(path.join(root,`bars/${s}.json`),BarsSchema);if(b.symbol!==s)throw new Error(`Stored symbol mismatch: ${s}`);return [s,b.bars];}catch(e){if(isMissing(e))return [s,[]];throw e;}
  })));
  const end=symbols.map(s=>history[s]!.at(-1)?.date).filter((d):d is string=>!!d).sort()[0];if(!end)throw new InsufficientHistoryError(`No stored ${symbol} history`);
  const run=(config:typeof rules.live)=>{const features=buildFeatures(history,config,{symbol,reference});if(!features.some(f=>f.date<=end))throw new InsufficientHistoryError(`${symbol} needs ${config.smaSlow} ${reference} sessions plus RV60 warm-up before a model day exists; ${history[reference]?.length??0} stored`);if(config.id==="v3_1")rf=new Map(features.map(f=>[f.date,f.RF]));const start=features[0]!.date>"2018-01-01"?features[0]!.date:"2018-01-01",capital=1_000_000,result=replay(features,config,{start,end,capital});return validateReplay({schemaVersion:1,rulesId:config.id,start,end,capital,days:result.days,trades:result.trades,coreTrades:result.coreTrades,entries:result.entries,...summarize(result.days,features,result.trades,config.id)},config.id);};
  live=run(rules.live);archived=run(rules.archived);bars=[...history[symbol]!];
 }
 const points=compareReplays(live,archived,bars),monthly=periodCells(live.days,7),yearly=periodCells(live.days,4),archivedYearly=periodCells(archived.days,4);
 const benchmarkYearly=points.every(p=>p.benchmark!==null)?periodCells(points.map(p=>({date:p.date,equity:p.benchmark!})),4):[];
 return {symbol,live,archived,origin,points,monthly,yearly,archivedYearly,benchmarkYearly,metricInputs:metricInputs(live,rf),lastClose:bars.find(b=>b.date===live.days.at(-1)!.date)?.close??null};
}
