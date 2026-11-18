import { requirePageSession } from "@/auth/page";
import { Activity } from "lucide-react";
import { loadDashboard } from "@/dashboard/load";
import { GateCharts } from "@/components/gate-charts";
import { ContextNotice, Num, StateBadge } from "@/components/dashboard-ui";
import { RunStatus } from "@/components/run-status";
import { Working } from "@/components/working";
export default async function GatePage() {
  await requirePageSession();
  const d = await loadDashboard();
  const rows = (episodes: typeof d.episodes) => <table className="inventory dashboard-table"><thead><tr><th>State</th><th>Start</th><th>End</th><th>Sessions</th><th>SOXL return</th></tr></thead><tbody>{episodes.map(e => <tr key={e.start}><td data-label="State"><StateBadge state={e.state} /></td><td data-label="Start">{e.start}</td><td data-label="End">{e.end}</td><td data-label="Sessions"><Num value={e.days} label={`Episode ${e.start} sessions`} formula="count(rows in consecutive identical gate state)" /></td><td data-label="SOXL return"><Num value={e.return} label={`Episode ${e.start} return`} formula="SOXL last close / SOXL first close − 1" inputs={`Within episode ${e.start} through ${e.end}; excludes entry overnight return`} format="percent" /></td></tr>)}</tbody></table>;
  return <div className="page-stack"><div className="page-title"><div><div className="eyebrow">TREND & VOLATILITY</div><h1>Gate</h1></div><span className="chip"><Activity size={15} />V3.1</span></div><ContextNotice date={d.cutoff} /><GateCharts points={d.series} threshold={d.rules.rvSpike} /><section className="card"><div className="section-heading"><h2>Gate episodes <Working label="Gate episodes" formula="Consecutive sessions with the same V3.1 state" inputs="ON = b && c && a; RISK CUT = b && c && !a; OFF = !(b && c). KILL is live only." /></h2><span className="chip">Stored-history model</span></div>{rows(d.episodes.slice(0, 12))}{d.episodes.length > 12 && <details><summary className="disclosure-title">Earlier episodes</summary>{rows(d.episodes.slice(12))}</details>}</section><RunStatus /></div>;
}
