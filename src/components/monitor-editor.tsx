"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, ClipboardPen } from "lucide-react";
import { MonitorErrorSchema, ObservationCommandSchema, ObservationStateSchema, type Observation } from "@/schemas/monitor";
export function MonitorEditor({symbol,date,revision,selected,authorized}:{symbol:string;date:string;revision:string;selected?:Observation;authorized:boolean}) {
  const router=useRouter();const [currentRevision,setRevision]=useState(revision),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[errors,setErrors]=useState<Record<string,string>>({});
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=new FormData(e.currentTarget),number=(key:string)=>form.get(key)===""?null:Number(form.get(key));
    const input=ObservationCommandSchema.safeParse({revision:currentRevision,observation:{symbol,date:form.get("date"),ivPercent:number("ivPercent"),cadence:form.get("cadence"),bid:number("bid"),ask:number("ask"),openInterest:number("openInterest"),delta:number("delta"),expiry:form.get("expiry")||null,source:form.get("source")}});
    if(!input.success){setErrors(Object.fromEntries(input.error.issues.map(i=>[i.path.at(-1)!,i.message])));setMessage("Check the highlighted fields.");return;}
    setBusy(true);setMessage("");setErrors({});
    try{const response=await fetch("/api/monitors",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(input.data)}),body:unknown=await response.json();if(!response.ok){setMessage(MonitorErrorSchema.parse(body).message);return;}setRevision(ObservationStateSchema.parse(body).revision);setMessage("Observation saved. Live monitor refreshed; stored daily runs require Run now.");router.replace(`/spax?symbol=${encodeURIComponent(symbol)}&date=${input.data.observation.date}`,{scroll:false});router.refresh();}
    catch{setMessage("Save could not be confirmed. Reload before retrying.");}finally{setBusy(false);}
  }
  const error=(key:string)=>errors[key]?<small className="field-error" role="alert">{errors[key]}</small>:null;
  return <section className="card portfolio-editor"><div className="section-heading"><h2><ClipboardPen size={20}/>Manual observations</h2><span className="chip">{symbol} · no broker connection</span></div>{!authorized&&<div className="notice warning">Saving requires a signed-in session. Sign in to continue.</div>}<div role="status" aria-live="polite">{message}</div><form onSubmit={save}><fieldset className="portfolio-fields" disabled={busy}><div className="entry-grid">
    <label>Observation date<input name="date" type="date" defaultValue={date} required/>{error("date")}</label>
    <label>Annual IV (%)<input name="ivPercent" type="number" min="0.000001" max="1000" step="any" inputMode="decimal" defaultValue={selected?.ivPercent??""}/>{error("ivPercent")}</label>
    <label>Expiries<select aria-label="Expiries" name="cadence" defaultValue={selected?.cadence??"unconfirmed"}><option value="unconfirmed">Unconfirmed</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="none">No tradeable expiries</option></select></label>
    {([['bid','Bid ($)'],['ask','Ask ($)'],['openInterest','Open interest'],['delta','Put delta (−0.20)']] as const).map(([key,label])=><label key={key}>{label}<input aria-label={label} name={key} type="number" inputMode={key==="openInterest"?"numeric":"decimal"} step={key==="openInterest"?1:"any"} min={key==="delta"?-1:0} max={key==="delta"?0:undefined} defaultValue={selected?.[key]??""}/>{error(key)}</label>)}
    <label>Quoted expiry<input name="expiry" type="date" defaultValue={selected?.expiry??""}/>{error("expiry")}</label>
    <label>Source / screen note<input name="source" maxLength={500} defaultValue={selected?.source??""} required placeholder="Broker screen and observation time"/>{error("source")}</label>
    </div><div className="form-actions"><small className="muted">Blank = unconfirmed · no forward-fill · saving replaces this symbol/date.</small><button className="button primary" type="submit" disabled={!authorized||busy}><Save size={18}/>{busy?"Saving…":"Save observation"}</button></div></fieldset></form></section>;
}
