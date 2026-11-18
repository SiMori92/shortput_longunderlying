import path from "node:path";
import { createHash } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { z } from "zod";
import { atomicWrite, dataRoot, isMissing, readJson } from "../data/store";
import { BarsSchema } from "../schemas/bars";
import { UnderlyingsSchema } from "../schemas/config";
import { MarketFactsSchema, SymbolStatusSchema } from "../schemas/market";
import { DateSchema } from "../schemas/common";
import { MonitorConfigsSchema, ObservationStateSchema, ObservationsSchema, ObservationCommandSchema, type MonitorResult } from "../schemas/monitor";
import type { History } from "../engine/types";
import { expectedClose, marketDate, session, sessions } from "../market/calendar";
import { buildMonitor } from "./model";
export const UpdateStatusSchema=z.strictObject({timestamp:z.iso.datetime(),asOf:DateSchema,symbols:z.array(SymbolStatusSchema)});
export async function optionalJson<T>(file:string,schema:z.ZodType<T>):Promise<T|null> {try{return await readJson(file,schema);}catch(e){if(isMissing(e))return null;throw e;}}
export async function readObservations(root=dataRoot()) {
  const observations=await readJson(path.join(root,"monitors/observations.json"),ObservationsSchema);
  observations.sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.date.localeCompare(b.date));
  return ObservationStateSchema.parse({revision:createHash("sha256").update(JSON.stringify(observations)).digest("hex"),observations});
}
export class MonitorConflict extends Error {}
export class MonitorInputError extends Error {}
export async function saveObservation(input:unknown,root=dataRoot(),now=new Date()) {
  const command=ObservationCommandSchema.parse(input),o=command.observation;
  const [registry,configs]=await Promise.all([readJson(path.join(root,"config/underlyings.json"),UnderlyingsSchema),readJson(path.join(root,"config/monitors.json"),MonitorConfigsSchema)]);
  if(!registry.some(u=>u.symbol===o.symbol&&u.role==="monitor")||!configs.some(c=>c.symbol===o.symbol))throw new MonitorInputError("Choose a configured monitor symbol.");
  if(o.date<"2010-01-01"||o.date>marketDate(now)||!session(o.date))throw new MonitorInputError("Choose an elapsed or current NYSE session.");
  if(o.expiry&&(o.expiry>"2028-12-31"||o.expiry<"2010-01-01"||!session(o.expiry)))throw new MonitorInputError("Expiry must be a known NYSE session.");
  const file=path.join(root,"monitors/.write.lock");let lock;
  try{lock=await open(file,"wx",0o600);}catch(e){if(e instanceof Error&&"code" in e&&e.code==="EEXIST")throw new MonitorConflict("Monitor inputs are being saved. Reload before retrying; abandoned locks require operator review.");throw e;}
  try {
    const state=await readObservations(root);
    if(command.revision!==state.revision)throw new MonitorConflict("Monitor inputs changed in another tab. Reload before saving.");
    const observations=[...state.observations.filter(v=>v.symbol!==o.symbol||v.date!==o.date),o].sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.date.localeCompare(b.date));
    await atomicWrite(path.join(root,"monitors/observations.json"),ObservationsSchema,observations);
    return await readObservations(root);
  }finally{await lock.close();await unlink(file);}
}
type Registry=z.infer<typeof UnderlyingsSchema>;
function factsFor(u:Registry[number],stored:z.infer<typeof MarketFactsSchema>|null,asOf:string):MonitorResult["facts"] {
  const keys=["launchDate","yahooSymbol","issuer","expenseRatio","listedOptions","aum","volume"] as const;
  return keys.map(key=>{
    const configured=u.facts?.[key];let value:string|number|boolean="unconfirmed",source:string|null=null,date:string|null=null;
    if(configured&&configured!=="unconfirmed") {
      const v=configured.value;
      const valid=key==="launchDate"?DateSchema.safeParse(v).success&&String(v)<=asOf:key==="yahooSymbol"?v===u.symbol:key==="issuer"?typeof v==="string"&&v.length>0:key==="listedOptions"?typeof v==="boolean":typeof v==="number"&&v>=0;
      if(valid&&configured.checkedAt.slice(0,10)<=asOf){value=v;source=configured.source;date=configured.checkedAt.slice(0,10);}
    }
    // Provider identity/volume are evidence only when not from a later requested date.
    if(stored&&stored.symbol===u.symbol) {
      if(key==="yahooSymbol"&&stored.yahooSymbol!=="unconfirmed"&&stored.yahooSymbol.value===u.symbol&&stored.checkedAt.slice(0,10)<=asOf){value=stored.yahooSymbol.value;source=stored.yahooSymbol.source;date=stored.checkedAt.slice(0,10);}
      if(key==="volume"&&stored.volume!=="unconfirmed"&&stored.volume.asOf===asOf){value=stored.volume.value;source=stored.volume.source;date=stored.volume.asOf;}
    }
    return {key,value,confirmed:value!=="unconfirmed",source,asOf:date};
  });
}
export async function loadMonitors(options:{root?:string;asOf?:string;history?:History;statuses?:z.infer<typeof SymbolStatusSchema>[];preview?:boolean}={}) {
  const root=options.root??dataRoot(),asOf=options.asOf??expectedClose(new Date());
  const [registry,configs,state,update]=await Promise.all([readJson(path.join(root,"config/underlyings.json"),UnderlyingsSchema),readJson(path.join(root,"config/monitors.json"),MonitorConfigsSchema),readObservations(root),optionalJson(path.join(root,"updates/latest.json"),UpdateStatusSchema)]);
  const results:MonitorResult[]=[];
  for(const u of registry.filter(u=>u.role==="monitor")) {
    const config=configs.find(c=>c.symbol===u.symbol);
    if(!config||!u.reference||u.leverage===null)throw new Error(`Missing monitor parameters/reference/leverage for ${u.symbol}`);
    if(!registry.some(r=>r.symbol===u.reference))throw new Error(`Missing reference registration for ${u.symbol}`);
    const [assetStored,refStored,storedFacts]=await Promise.all([optionalJson(path.join(root,`bars/${u.symbol}.json`),BarsSchema),optionalJson(path.join(root,`bars/${u.reference}.json`),BarsSchema),optionalJson(path.join(root,`facts/${u.symbol}.json`),MarketFactsSchema)]);
    if(assetStored&&assetStored.symbol!==u.symbol||refStored&&refStored.symbol!==u.reference||storedFacts&&storedFacts.symbol!==u.symbol)throw new Error(`Stored monitor symbol mismatch for ${u.symbol}`);
    const asset=(options.history?.[u.symbol]??assetStored?.bars??[]).filter(b=>b.date<=asOf),referenceBars=(options.history?.[u.reference]??refStored?.bars??[]).filter(b=>b.date<=asOf);
    const statuses=options.statuses??(update?.asOf===asOf?update.symbols:[]),warnings:string[]=[];
    let valid=true;
    for(const [symbol,bars] of [[u.symbol,asset],[u.reference,referenceBars]] as const) {
      const status=statuses.find(s=>s.symbol===symbol),last=bars.at(-1)?.date;
      if(!status||status.expectedDate!==asOf||status.lastDate!==asOf||status.count!==bars.length||status.issues.length||status.provisional){valid=false;warnings.push(`${symbol}: final market validation is unconfirmed for ${asOf}.`);}
      warnings.push(...(status?.issues.map(i=>`${symbol}: ${i.message}`)??[]));
      if(!last||last!==asOf){valid=false;warnings.push(`${symbol}: stale or missing close (last ${last??"unconfirmed"}).`);}
      if(bars.some(b=>b.close<=0||!session(b.date)))throw new Error(`Invalid monitor close/session for ${symbol}`);
      if(bars.length){const dates=new Set(bars.map(b=>b.date)),missing=sessions(bars[0]!.date,asOf).filter(d=>!dates.has(d));if(missing.length){valid=false;warnings.push(`${symbol}: ${missing.length} missing NYSE sessions.`);}}
    }
    const facts=factsFor(u,storedFacts,asOf);
    // Yahoo identity may be checked just after the close (next UTC date).
    // Retain it only for the current stored history view, never backdate historical evidence.
    if(storedFacts?.yahooSymbol!==undefined&&storedFacts.yahooSymbol!=="unconfirmed"&&storedFacts.yahooSymbol.value===u.symbol&&update?.asOf===asOf&&storedFacts.checkedAt===update.timestamp){
      const f=facts.find(f=>f.key==="yahooSymbol")!;f.value=u.symbol;f.confirmed=true;f.source=storedFacts.yahooSymbol.source;f.asOf=storedFacts.checkedAt.slice(0,10);
    }
    results.push(buildMonitor({config,reference:u.reference,leverage:u.leverage,asset,referenceBars,asOf,observations:state.observations,facts,dataStatus:options.preview?"provisional":valid?"valid":"unconfirmed",warnings}));
  }
  return {results,configs,state};
}
