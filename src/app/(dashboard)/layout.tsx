import { expectedClose } from "@/market/calendar";
import { readOptionalRun } from "@/runs/service";
import { Shell } from "@/components/shell";
import { readJson, dataRoot } from "@/data/store";
import { BarsSchema } from "@/schemas/bars";
import path from "node:path";
import { requirePageSession } from "@/auth/page";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePageSession();
  const soxl = await readJson(path.join(dataRoot(), "bars/SOXL.json"), BarsSchema);
  const run = await readOptionalRun(path.join(dataRoot(), "runs/last-attempt.json"));
  return <Shell asOf={run?.asOf ?? soxl.bars.at(-1)?.date ?? "Unconfirmed"} runType={run?.type ?? "Seed"} freshness={run && run.asOf < expectedClose(new Date()) ? "blocked" : run?.freshness.status ?? "unconfirmed"}>{children}</Shell>;
}
