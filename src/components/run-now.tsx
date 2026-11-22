"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { RunResponseSchema } from "@/schemas/run";
import type { StrategySymbol } from "@/strategy/symbols";
export function RunNow({ symbol }: { symbol: StrategySymbol }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const router = useRouter();
  async function run() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ type: "final", symbol }) });
      const value = RunResponseSchema.parse(await response.json());
      setMessage("error" in value ? value.message : `${value.symbol} ${value.asOf}: ${value.freshness.status}${value.freshness.actionsBlocked ? " · actions blocked" : ""}`);
      if (!("error" in value)) router.refresh();
    } catch { setMessage("Run unavailable. Previous valid final retained."); }
    finally { setBusy(false); }
  }
  return <div className="run-now"><button className="button primary run-button" aria-label="Run now" aria-busy={busy} disabled={busy} title="Generate updated model analysis" onClick={run}><RefreshCw size={18} className={busy ? "spin" : undefined} /><span className="run-button-label">{busy ? "Running…" : "Run now"}</span></button>{message && <div className="run-message" role="status"><span>{message}</span><button aria-label="Dismiss run message" onClick={() => setMessage("")}>×</button></div>}</div>;
}
