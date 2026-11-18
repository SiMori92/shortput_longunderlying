import { RunResultSchema, type RunResult } from "../schemas/run";
import type { MonitorResult } from "../schemas/monitor";
export function attachMonitor(run:RunResult,monitor:MonitorResult|undefined):RunResult {
  if(!monitor)return run;
  const working={...run.working};
  for(const [key,value] of Object.entries(monitor.working))working[`spax.monitor.${key}`]=value;
  const checks=monitor.checks.map(({id,status,value})=>({id,status,value}));
  checks.forEach((c,i)=>{if(typeof c.value==="number")working[`spax.checks.${i}.value`]={formula:monitor.checks[i]!.detail,inputs:{symbol:monitor.symbol,asOf:monitor.asOf},result:c.value};});
  return RunResultSchema.parse({...run,spax:{verdict:monitor.verdict,checks,warnings:monitor.warnings,monitor},working});
}
