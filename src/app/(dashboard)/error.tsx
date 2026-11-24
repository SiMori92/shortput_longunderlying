"use client";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Alert } from "@/components/ui";

/** Failed state (workbook §6.9): a failed request is never shown as an empty or reassuring state. */
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error("[dashboard] Page failed to load", error); }, [error]);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return <div className="page-stack">
    <PageHeading eyebrow={<>Request failed</>} title={<>Couldn&apos;t load this page</>} description="The page did not finish loading. Stored data and runs are unchanged." compact />
    <Alert tone="error">This view failed to load, so its figures are not shown. Retry; if it fails again, check the server log{digest ? <> for error <code>{digest}</code></> : null}.</Alert>
    <div><button type="button" className="button primary" onClick={() => retry()}><RotateCcw size={18} aria-hidden="true" />Retry</button></div>
  </div>;
}
