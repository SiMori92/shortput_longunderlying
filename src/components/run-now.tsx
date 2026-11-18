"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { RunResponseSchema } from "@/schemas/run";
export function RunNow() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const router = useRouter();
  async function run() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ type: "final" }) });
      const value = RunResponseSchema.parse(await response.json());
      setMessage("error" in value ? value.message : `${value.asOf}: ${value.freshness.status}${value.freshness.actionsBlocked ? " · actions blocked" : ""}`);
      if (!("error" in value)) router.refresh();
    } catch { setMessage("Run unavailable. Previous valid final retained."); }
    finally { setBusy(false); }
  }
  return <div className="run-now"><button className="icon-button" aria-label="Run now" disabled={busy} title="Authenticated session required" onClick={run}><RefreshCw size={18} className={busy ? "spin" : undefined} /></button>{message && <div className="run-message" role="status"><span>{message}</span><button aria-label="Dismiss run message" onClick={() => setMessage("")}>×</button></div>}</div>;
}
