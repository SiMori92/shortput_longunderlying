import { requirePageSession } from "@/auth/page";
import { Activity } from "lucide-react";
import { loadDashboard } from "@/dashboard/load";
import { GateCharts } from "@/components/gate-charts";
import { ContextNotice, Num, StateBadge } from "@/components/dashboard-ui";
import { RunStatus } from "@/components/run-status";
import { Working } from "@/components/working";
import { selectedStrategy } from "@/strategy/server";
export default async function GatePage() {
  await requirePageSession();
  const d = await loadDashboard(await selectedStrategy()), { symbol } = d, REF = d.strategy.reference;
  const rows = (episodes: typeof d.episodes) => <table className="inventory dashboard-table"><thead><tr><th>State</th><th>Start</th><th>End</th><th>Sessions</th><th>{symbol} return</th></tr></thead><tbody>{episodes.map(e => <tr key={e.start}><td data-label="State"><StateBadge state={e.state} /></td><td data-label="Start">{e.start}</td><td data-label="End">{e.end}</td><td data-label="Sessions"><Num value={e.days} label={`Episode ${e.start} sessions`} formula="count(rows in consecutive identical gate state)" /></td><td data-label={`${symbol} return`}><Num value={e.return} label={`Episode ${e.start} return`} formula={`${symbol} last close / ${symbol} first close − 1`} inputs={`Within episode ${e.start} through ${e.end}; excludes entry overnight return`} format="percent" /></td></tr>)}</tbody></table>;
  return <div className="page-stack"><div className="page-title"><div><div className="eyebrow">TREND & VOLATILITY</div><h1>Gate</h1></div><span className="chip"><Activity size={15} />V3.1 · {symbol} vs {REF}</span></div><ContextNotice date={d.cutoff} />{!d.series.length && <div className="notice warning" role="status">{d.sessions.reference} {REF} sessions stored; the gate needs {d.rules.smaSlow} plus RV60 warm-up before the first point.</div>}<GateCharts points={d.series} threshold={d.rules.rvSpike} reference={REF} /><section className="card"><div className="section-heading"><h2>Gate episodes <Working label="Gate episodes" formula="Consecutive sessions with the same V3.1 state" inputs="ON = b && c && a; RISK CUT = b && c && !a; OFF = !(b && c). KILL is live only." /></h2><span className="chip">Stored-history model</span></div>{rows(d.episodes.slice(0, 12))}{d.episodes.length > 12 && <details><summary className="disclosure-title">Earlier episodes</summary>{rows(d.episodes.slice(12))}</details>}</section><RunStatus symbol={symbol} /></div>;
}
