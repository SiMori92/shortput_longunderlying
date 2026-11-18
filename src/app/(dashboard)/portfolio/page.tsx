import { requirePageSession } from "@/auth/page";
import path from "node:path";
import Link from "next/link";
import { headers } from "next/headers";
import { z } from "zod";
import { AlertTriangle, History, Wallet, NotebookPen } from "lucide-react";
import { authenticated } from "@/auth/session";
import { readPortfolio } from "@/portfolio/service";
import { matchesSnapshot } from "@/portfolio/basis";
import { consistency } from "@/portfolio/model";
import { PortfolioEditor } from "@/components/portfolio-editor";
import { Num, Empty, ContextNotice } from "@/components/dashboard-ui";
import { loadDashboard } from "@/dashboard/load";
import { readOptionalRun } from "@/runs/service";
import { dataRoot } from "@/data/store";
import { markPuts, gapBreakdown } from "@/dashboard/model";
import { DateSchema } from "@/schemas/common";
import { expectedClose } from "@/market/calendar";
export default async function Portfolio({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  await requirePageSession();
  const query = z.object({ date: DateSchema.optional() }).safeParse(await searchParams);
  if (!query.success) return <div className="notice warning">Invalid snapshot date.</div>;
  const [state, dashboard, requestHeaders] = await Promise.all([readPortfolio(), loadDashboard(), headers()]);
  const date = query.data.date ?? state.entries.at(-1)?.date ?? expectedClose(new Date());
  const selected = state.entries.find(e => e.date === date), previous = state.entries.filter(e => e.date < date).at(-1);
  const priorRun = previous ? await readOptionalRun(path.join(dataRoot(), "runs", `${previous.date}_final.json`)) : null;
  const warnings = selected ? consistency(selected, previous, priorRun && matchesSnapshot(priorRun, state.entries) ? priorRun : null) : [];
  const row = dashboard.features.find(f => f.date === date);
  const marks = selected && row ? markPuts(selected, row, dashboard.rules) : [];
  const gap = selected && row ? gapBreakdown(row, selected.shares, marks, selected.accountValue, dashboard.rules) : null;
  const peak = selected ? Math.max(selected.accountValue, ...state.entries.filter(e => e.date <= date).map(e => e.accountValue)) : null;
  const dd = selected && peak ? selected.accountValue / peak - 1 : null;
  const authorized = authenticated(new Request("http://localhost/portfolio", { headers: requestHeaders }));
  return <div className="page-stack">
    <div className="page-title"><div><div className="eyebrow">ENTERED ACCOUNT</div><h1>Portfolio</h1></div><span className="chip"><Wallet size={16} />{date}</span></div>
    <div className="notice">Snapshot date is the close being recorded. Saving does not rewrite stored recommendations.</div>
    {selected && <><div className="kpi-grid">
      <div className="card"><span className="muted">Entered equity</span><h2><Num value={selected.accountValue} label="Entered account value" formula="Manually entered NAV; already includes account liabilities" format="money" /></h2></div>
      <div className="card"><span className="muted">Drawdown · entered peak</span><h2><Num value={dd} label="Entered drawdown" formula="accountValue / max(entered NAV through selected date) - 1" inputs={`NAV=${selected.accountValue}; peak=${peak}`} format="percent" /></h2><span className={`chip ${dd !== null && dd <= dashboard.rules.killDrawdown ? "warning" : ""}`}>{dd !== null && dd <= dashboard.rules.killDrawdown ? "KILL · manual review" : "Entered-history basis"}</span></div>
      <div className="card"><span className="muted">Core weight · model close</span><h2><Num value={row ? selected.shares * row.S / selected.accountValue : null} label="Entered core weight" formula="shares × stored SOXL close / entered NAV" inputs={`shares=${selected.shares}; S=${row?.S}; NAV=${selected.accountValue}`} format="percent" /></h2></div>
      <div className="card"><span className="muted">Put notional</span><h2><Num value={selected.openPuts.reduce((s,p) => s + p.strike*p.contracts*100,0) / selected.accountValue} label="Entered put notional" formula="Σ(strike × contracts × 100) / entered NAV" inputs={JSON.stringify(selected.openPuts)} format="percent" /></h2></div>
      <div className="card"><span className="muted">Gap usage · model</span><h2><Num value={gap ? (gap.core + gap.puts) / selected.accountValue : null} label="Entered gap usage" formula="[shares×S×gapSize + Σ(max(K−S×(1−gapSize),0)−modelValue)×contracts×100] / NAV" inputs={JSON.stringify({ gap, S: row?.S, gapSize: dashboard.rules.gapSize, marks })} format="percent" /></h2></div>
    </div>{row ? <ContextNotice date={date} /> : <div className="notice warning">No matching stored feature row; model exposure values are unconfirmed.</div>}</>}
    {warnings.length > 0 && <div className="card"><h2><AlertTriangle size={20} />Consistency review</h2><ul className="consistency-list">{warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
    <PortfolioEditor key={date} initial={state} selected={selected} date={date} authorized={authorized} />
    <section className="card"><div className="section-heading"><h2><History size={20} />Snapshot history</h2></div>{state.entries.length === 0 ? <Empty>No snapshots saved</Empty> : <table className="inventory dashboard-table"><thead><tr><th>Date</th><th>Account value</th><th>Shares</th><th>Open contracts</th><th>Edit</th></tr></thead><tbody>{[...state.entries].reverse().map(e => <tr key={e.date}><td data-label="Date">{e.date}</td><td data-label="Account value"><Num value={e.accountValue} label={`${e.date} NAV`} formula="Entered NAV" format="money" /></td><td data-label="Shares"><Num value={e.shares} label={`${e.date} shares`} formula="Entered whole SOXL shares" /></td><td data-label="Open contracts"><Num value={e.openPuts.reduce((s,p) => s+p.contracts,0)} label={`${e.date} contracts`} formula="Sum of entered whole contracts" /></td><td data-label="Edit"><Link className="button" href={`/portfolio?date=${e.date}`}>Edit snapshot</Link></td></tr>)}</tbody></table>}</section>
    <section className="card"><div className="section-heading"><h2><NotebookPen size={20} />Journal</h2></div>{state.journal.length === 0 ? <Empty>No executions recorded</Empty> : <table className="inventory dashboard-table journal-table"><thead><tr><th>Date</th><th>Recommendation</th><th>What was done</th><th>Note</th></tr></thead><tbody>{[...state.journal].reverse().map(j => <tr key={j.id}><td data-label="Date">{j.date}<small className="muted journal-run">{j.runId}</small></td><td data-label="Recommendation">{j.recommendation}</td><td data-label="What was done">{j.done}</td><td data-label="Note">{j.note || "—"}</td></tr>)}</tbody></table>}</section>
  </div>;
}
