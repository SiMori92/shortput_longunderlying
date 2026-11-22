import { PageHeading } from "@/components/page-heading";
import { requirePageSession } from "@/auth/page";
import Link from "next/link";
import { z } from "zod";
import { DateSchema } from "@/schemas/common";
import { ArrowDownToLine } from "lucide-react";
import { loadDashboard } from "@/dashboard/load";
import { gapBreakdown, historicalReplay, markPuts } from "@/dashboard/model";
import { ContextNotice, Empty, Num } from "@/components/dashboard-ui";
import { ClosedPuts, GapBar, OpenPuts } from "@/components/put-tables";
import { RunStatus } from "@/components/run-status";
import { RulesSchema } from "@/schemas/config";
import { dataRoot, readJson } from "@/data/store";
import path from "node:path";
import { selectedStrategy } from "@/strategy/server";
export default async function PutsPage({ searchParams }: { searchParams: Promise<{ book?: string; date?: string }> }) {
  await requirePageSession();
  const query = z.object({ book: z.enum(["model", "archive"]).optional(), date: DateSchema.optional() }).safeParse(await searchParams);
  const { book, date } = query.success ? query.data : { book: undefined, date: undefined };
  const d = await loadDashboard(await selectedStrategy()), { symbol } = d;
  const model = book === "model" || book === "archive", archived = book === "archive";
  // Archived parameters with this ticker's own split factors.
  const rules = archived ? { ...await readJson(path.join(dataRoot(), "config/rules/archive/v3.json"), RulesSchema), ...(symbol === "SOXL" ? {} : { splits: d.rules.splits }) } : d.rules;
  const selected = date ? d.features.filter(f => f.date <= date) : d.features;
  const replay = model ? historicalReplay(d.features, rules, selected.at(-1)?.date ?? "2018-01-01") : null, day = replay?.days.at(-1), row = model ? selected.at(-1) : d.features.find(f => f.date === d.run?.asOf);
  const snapshot = model && day ? { date: day.date, accountValue: day.equity, shares: day.coreQty, openPuts: day.positions.map((p, i) => ({ id: `model-${i}`, symbol, opened: p.open, strike: p.K, expiry: p.expiry, contracts: p.qty / 100, credit: p.credit })) } : d.available ? d.snapshot : undefined;
  const puts = snapshot && row ? markPuts(snapshot, row, rules, model ? day?.positions.map(p => p.value) : undefined) : null;
  const basis = model ? `${archived ? "Archived V3" : "V3.1"} model · ${day?.date ?? d.cutoff}` : `Entered account · ${d.run?.asOf ?? "unconfirmed"}`;
  return <div className="page-stack"><PageHeading eyebrow={<>POSITION & PREMIUM DESK · {symbol}</>} title={<>Puts</>} description="Review open positions, model valuations, and gap exposure by book." action={<ArrowDownToLine size={24} />} /><nav className="book-tabs" aria-label="Put book"><Link href="/puts" aria-current={!model ? "page" : undefined}>Entered account</Link><Link href="/puts?book=model" aria-current={model && !archived ? "page" : undefined}>V3.1 model</Link><Link href="/puts?book=archive" aria-current={archived ? "page" : undefined}>Archived V3</Link></nav>
    {!query.success && <div className="notice">Invalid book or date. Showing entered account.</div>}
    {model && <><ContextNotice date={day?.date ?? d.cutoff} /><form className="history-date" action="/puts"><input type="hidden" name="book" value={book} /><label htmlFor="history-date">Model as of</label><input id="history-date" type="date" name="date" min="2018-01-02" max={d.cutoff} defaultValue={day?.date ?? d.cutoff} /><button type="submit">View</button></form></>}
    {model && day && <div className="detail-strip card"><span>{basis}</span><span>Starting model capital <Num value={1000000} label="Replay start capital" formula="Python parity replay start capital" format="money" /></span><span>Model equity <Num value={day.equity} label="Historical model equity" formula={`cash + coreQty × ${symbol} − Σ modelValue × qty`} inputs={`Replay from 2018-01-01 through ${day.date}; ${rules.version}`} format="money" /></span></div>}
    {puts ? <OpenPuts rows={puts} basis={basis} recorded={model} /> : <section className="card"><h2>Open puts · entered account</h2><Empty>{d.snapshot ? "Valuation blocked by market validation." : "No current account snapshot. Open positions are unconfirmed."}</Empty><Link className="text-link" href="/portfolio">Portfolio entry · M5</Link></section>}
    {snapshot && row && puts ? <GapBar gap={gapBreakdown(row, snapshot.shares, puts, snapshot.accountValue, rules)} /> : <section className="card"><h2>Gap budget</h2><Empty>Unconfirmed · requires an account snapshot and validated market data.</Empty></section>}
    {replay ? <ClosedPuts trades={replay.trades} /> : <section className="card"><h2>Closed puts · entered account</h2><Empty>No recorded fills. Snapshot removals cannot establish a realized P&L.</Empty><Link className="text-link" href="/puts?book=model">Explore historical model trades</Link></section>}
    <RunStatus symbol={symbol} /></div>;
}
