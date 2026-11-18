import path from "node:path";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { dataRoot, isMissing, readJson } from "@/data/store";
import { readOptionalRun } from "@/runs/service";
import { MarketFactsSchema } from "@/schemas/market";
import { expectedClose } from "@/market/calendar";
import { strategyRoot } from "@/strategy/paths";
import type { StrategySymbol } from "@/strategy/symbols";
export async function RunStatus({ symbol }: { symbol: StrategySymbol }) {
  const run = await readOptionalRun(path.join(strategyRoot(dataRoot(), symbol), "runs/last-attempt.json"));
  let facts = null;
  try { facts = await readJson(path.join(dataRoot(), `facts/${symbol}.json`), MarketFactsSchema); } catch (e) { if (!isMissing(e)) throw e; }
  const stale = run && run.asOf < expectedClose(new Date());
  const unconfirmed = facts ? (["issuer", "expenseRatio", "listedOptions", "aum"] as const).filter(k => facts[k] === "unconfirmed").length : 0;
  return <section className="card run-status" aria-label="Run validation"><div className="section-heading"><h2><Clock3 size={19} />Run validation · {symbol}</h2><span className={`chip ${run?.freshness.status === "valid" && !stale ? "" : "warning"}`}>{run ? `${run.asOf} · ${run.type}` : "Awaiting first run"}</span></div>
    {!run ? <p className="muted small">Engine verified · scheduler registered · no validated daily run for {symbol}. Press run to generate one.</p> : <><div className="run-state"><strong>{stale ? "Stale" : run.freshness.status}</strong><span className="chip">{run.freshness.actionsBlocked || stale ? "Actions blocked" : "Validated"}</span></div>
      {stale && <div className="notice"><AlertTriangle size={18} /><span>Latest attempt is stale. Actions blocked until a fresh run.</span></div>}
      <ul className="validation-issues">{run.freshness.issues.map((issue, i) => <li key={i}><AlertTriangle size={16} /><span>{issue.symbol && <b>{issue.symbol} · </b>}{issue.message}</span><span className="chip">{issue.blocking ? "Blocked" : "Monitor"}</span></li>)}</ul>
      <div className="run-symbols">{run.freshness.symbols.map(s => <span className={`chip ${s.issues.length ? "warning" : ""}`} key={s.symbol}>{s.issues.length ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{s.symbol} · {s.lastDate ?? "unconfirmed"}</span>)}</div>
      {run.changesSincePreview.length > 0 && <details><summary>Changed since preview</summary><ul>{run.changesSincePreview.map((c, i) => <li key={i}>{c}</li>)}</ul></details>}
    </>}
    {facts && <div className="facts-strip"><strong>{symbol} · instrument facts</strong><span className="chip">Yahoo symbol: {typeof facts.yahooSymbol === "object" ? facts.yahooSymbol.value : "unconfirmed"}</span>{unconfirmed > 0 && <span className="chip warning">Issuer / fee / options / AUM: unconfirmed</span>}</div>}
  </section>;
}
