"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, NotebookPen, Wallet } from "lucide-react";
import { PortfolioEntrySchema, PortfolioCommandSchema, PortfolioStateSchema, PortfolioErrorSchema, type PortfolioEntry, type PortfolioState } from "@/schemas/portfolio";
export function PortfolioEditor({ initial, selected, date, authorized }: { initial: PortfolioState; selected?: PortfolioEntry; date: string; authorized: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial), [puts, setPuts] = useState(selected?.openPuts ?? []);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});
  async function send(input: unknown) {
    const parsed = PortfolioCommandSchema.safeParse(input);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path.join("."), i.message]))); setMessage("Check the highlighted fields."); return false; }
    setBusy(true); setMessage(""); setErrors({});
    try {
      const response = await fetch("/api/portfolio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const value: unknown = await response.json();
      if (!response.ok) { setMessage(PortfolioErrorSchema.parse(value).message); return false; }
      setState(PortfolioStateSchema.parse(value)); setMessage(parsed.data.operation === "snapshot" ? "Snapshot saved. Stored runs are unchanged; run again for updated recommendations." : "Journal entry saved.");
      router.replace(`/portfolio?date=${parsed.data.operation === "snapshot" ? parsed.data.entry.date : parsed.data.date}`, { scroll: false }); router.refresh(); return true;
    } catch { setMessage("Save could not be confirmed. Reload before retrying."); return false; }
    finally { setBusy(false); }
  }
  async function snapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const entry = { date: data.get("date"), accountValue: Number(data.get("accountValue")), shares: Number(data.get("shares")), openPuts: puts };
    const parsed = PortfolioEntrySchema.safeParse(entry);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path.join("."), i.message]))); setMessage("Check the highlighted fields."); return; }
    await send({ operation: "snapshot", revision: state.revision, entry: parsed.data });
  }
  const fieldError = (name: string) => errors[name] ? <small className="field-error" role="alert">{errors[name]}</small> : null;
  return <div className="page-stack portfolio-editor">
    {!authorized && <div className="notice warning">Saving requires a password/TOTP session. Sign in to save changes.</div>}
    <div aria-live="polite" role="status">{message}</div>
    <form className="card" onSubmit={snapshot}>
      <div className="section-heading"><h2><Wallet size={20} />Daily snapshot</h2><span className="chip">Entered NAV · SOXL</span></div>
      <fieldset disabled={busy} className="portfolio-fields"><div className="entry-grid">
        <label>Snapshot date<input required name="date" type="date" defaultValue={date} />{fieldError("date")}</label>
        <label>Account value ($)<input required name="accountValue" type="number" inputMode="decimal" step="0.01" min="0.01" defaultValue={selected?.accountValue ?? ""} />{fieldError("accountValue")}</label>
        <label>SOXL shares<input required name="shares" type="number" inputMode="numeric" step="1" min="0" defaultValue={selected?.shares ?? 0} />{fieldError("shares")}</label>
      </div>
      <div className="section-heading"><h3>Open puts</h3><button type="button" className="button" onClick={() => setPuts([...puts, { id: crypto.randomUUID(), symbol: "SOXL", opened: date, expiry: date, strike: 0, contracts: 1, credit: 0 }])}><Plus size={18} />Add put</button></div>
      <p className="muted">Net credit per share · actual entry · whole contracts</p>
      {fieldError("openPuts")}
      {puts.length === 0 && <div className="empty-state">No open puts entered</div>}
      {puts.map((put, i) => <div key={put.id} className="put-editor-row" role="group" aria-label={`Put ${i + 1}`}>
        {([['opened','Opened','date'],['expiry','Expiry','date'],['strike','Strike ($)','number'],['contracts','Contracts','number'],['credit','Entry credit ($/share)','number']] as const).map(([key,label,type]) => <label key={key}>{label}<input aria-label={`Put ${i + 1} ${label}`} type={type} required value={put[key] || (key === "credit" ? 0 : "")} inputMode={type === "number" ? key === "contracts" ? "numeric" : "decimal" : undefined} min={type === "number" ? key === "credit" ? 0 : key === "contracts" ? 1 : 0.000001 : undefined} step={key === "contracts" ? 1 : "any"} onChange={e => setPuts(puts.map((p,j) => j === i ? { ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value } : p))} />{fieldError(`openPuts.${i}.${key}`)}</label>)}
        <button type="button" className="icon-button" aria-label={`Remove put ${i + 1}`} onClick={() => setPuts(puts.filter(p => p.id !== put.id))}><Trash2 size={18} /></button>
      </div>)}
      <div className="form-actions"><small className="muted">Saving an existing date replaces that snapshot. Later snapshots are independent.</small><button className="button primary" disabled={!authorized || busy} type="submit"><Save size={18} />{busy ? "Saving…" : "Save snapshot"}</button></div>
      </fieldset>
    </form>
    <form className="card" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget, data = new FormData(form); if (await send({ operation: "journal", revision: state.revision, date: data.get("journalDate"), done: data.get("done"), note: data.get("note") })) form.reset(); }}>
      <div className="section-heading"><h2><NotebookPen size={20} />Execution journal</h2><span className="chip">Manual record</span></div>
      <fieldset disabled={busy} className="portfolio-fields"><div className="entry-grid">
        <label>Journal date<input required type="date" name="journalDate" defaultValue={date} />{fieldError("date")}</label>
        <label>What was done<textarea required maxLength={4000} name="done" placeholder="Held cash / bought shares / closed put…" />{fieldError("done")}</label>
        <label>Note<textarea name="note" maxLength={4000} placeholder="Fill price, transfer or reason" />{fieldError("note")}</label>
      </div><div className="form-actions"><small className="muted">Recommendation is captured from the stored valid final, or labelled unconfirmed.</small><button className="button primary" type="submit" disabled={!authorized || busy}><Plus size={18} />Add journal entry</button></div></fieldset>
    </form>
  </div>;
}
