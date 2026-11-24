import { PageHeading } from "@/components/page-heading";
import { requirePageSession } from "@/auth/page";
import { Activity, Archive, BadgeDollarSign, FileSliders, Fingerprint, ShieldHalf, TrendingUp, CircleDollarSign } from "lucide-react";
import { loadRules } from "@/backtest/load";
import { ruleRows } from "@/backtest/rules";
import { Num } from "@/components/dashboard-ui";
import { Working } from "@/components/working";
import type { Rules } from "@/schemas/config";
import path from "node:path";
import { dataRoot, readJson } from "@/data/store";
import { KnownSplitsSchema } from "@/schemas/market";
import { selectedStrategy } from "@/strategy/server";
import { strategyRules } from "@/strategy/paths";
import { Alert, TableWrap } from "@/components/ui";
const icons={Identity:Fingerprint,Gate:Activity,Core:TrendingUp,"Model puts":CircleDollarSign,Risk:ShieldHalf,"Model costs":BadgeDollarSign};
function RuleTable({rules}:{rules:Rules}){return <TableWrap label={`${rules.version} rules`}><table className="inventory dashboard-table rules-table" aria-label={`${rules.version} rule parameters`}><thead><tr><th>Parameter</th><th>Value</th><th>Group</th></tr></thead><tbody>{ruleRows(rules).map(row=>{const Icon=icons[row.group];return <tr key={row.key}><td data-label="Parameter"><span className="rule-name"><Icon size={17}/>{row.label}</span><small className="small muted">{row.key}</small></td><td data-label="Value">{typeof row.value==="number"?<Num value={row.value} label={`${rules.version} ${row.label}`} format={row.format} formula={row.formula} inputs={`Config ${row.key}=${row.value}; rule=${rules.id}`}/>:Array.isArray(row.value)?<div className="split-list">{row.value.map(s=><span key={s.date}>{s.date} × <Num value={s.factor} label={`${rules.version} split ${s.date}`} formula={row.formula} inputs={`date=${s.date}; factor=${s.factor}`}/></span>)}</div>:<span className="number-working">{String(row.value)}<Working label={`${rules.version} ${row.label}`} formula={row.formula} inputs={`Config ${row.key}=${row.value}`}/></span>}</td><td data-label="Group"><span className="chip">{row.group}</span></td></tr>;})}</tbody></table></TableWrap>;}
export default async function RulesPage(){
  await requirePageSession();
 let r:Awaited<ReturnType<typeof loadRules>>;const symbol=await selectedStrategy();
 try{const loaded=await loadRules(),splits=await readJson(path.join(dataRoot(),"config/known-splits.json"),KnownSplitsSchema);r={live:strategyRules(loaded.live,symbol,splits),archived:strategyRules(loaded.archived,symbol,splits)};}catch(e){console.error("[rules] Config invalid",e);return <div className="page-stack"><PageHeading eyebrow={<>Configuration · read only</>} title={<>Rules</>} description="Inspect active strategy parameters and compare archived rules." /><Alert tone="error">Rule configuration failed validation. Restore the live and archived configs.</Alert></div>;}
 return <div className="page-stack"><PageHeading eyebrow={<>Configuration · read only</>} title={<>Rules</>} description="Inspect active strategy parameters and compare archived rules." action={<span className="chip"><FileSliders size={15} aria-hidden="true"/>{r.live.version} · live · {symbol}</span>} /><Alert tone="info" icon={<ShieldHalf size={18} aria-hidden="true"/>}>Current config · model option values · manual KILL applies only to live suggestions.</Alert><section className="card"><div className="section-heading"><h2>{r.live.version} parameters</h2><span className="chip">{r.live.gateMode}</span></div><RuleTable rules={r.live}/></section><details className="card archive-rules"><summary className="disclosure-title"><Archive size={18} aria-hidden="true"/>Archived: {r.archived.version}</summary><RuleTable rules={r.archived}/></details></div>;
}
