import path from "node:path";
import { authenticated, sameOrigin } from "@/auth/session";
import { currentAccountRun } from "@/portfolio/basis";
import { PortfolioEntriesSchema } from "@/schemas/portfolio";
import { dataRoot, readJson } from "@/data/store";
import { createRun, readOptionalRun, RunBusyError, InvalidRunInputError } from "@/runs/service";
import { RunErrorSchema, RunInputSchema, RunResultSchema } from "@/schemas/run";
import { requestStrategy } from "@/strategy/symbols";
import { strategyRoot } from "@/strategy/paths";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function error(code: Parameters<typeof RunErrorSchema.parse>[0], status: number) { return Response.json(RunErrorSchema.parse(code), { status, headers }); }
export async function GET(request: Request) {
  if (!authenticated(request)) return error({ error: "unauthorized", message: "Authenticated signed-in session required. Sign in to continue." }, 401);
  try {
    const dir = strategyRoot(dataRoot(), requestStrategy(request));
    const run = await readOptionalRun(path.join(dir, "runs/last-attempt.json"));
    if (!run) return error({ error: "run-failed", message: "No run available" }, 404);
    const snapshots = await readJson(path.join(dir, "portfolio/entries.json"), PortfolioEntriesSchema);
    return Response.json(RunResultSchema.parse(currentAccountRun(run, snapshots)), { headers });
  } catch (e) { console.error("[runs] Read failed", e); return error({ error: "run-failed", message: "Stored run failed validation" }, 503); }
}
export async function POST(request: Request) {
  if (!authenticated(request)) return error({ error: "unauthorized", message: "Authenticated signed-in session required. Sign in to continue." }, 401);
  if (!sameOrigin(request)) return error({ error: "forbidden", message: "Same-origin request required" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return error({ error: "invalid-input", message: "JSON body required" }, 415);
  let input: unknown;
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error("Missing body");
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 2048) { await reader.cancel(); throw new Error("Body too large"); } chunks.push(next.value); }
    input = RunInputSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { return error({ error: "invalid-input", message: "Invalid run input (maximum 2KB)" }, 400); }
  try { return Response.json(RunResultSchema.parse(await createRun(input)), { headers }); }
  catch (e) {
    if (e instanceof InvalidRunInputError) return error({ error: "invalid-input", message: e.message }, 400);
    if (e instanceof RunBusyError) return error({ error: "busy", message: e.message }, 409);
    console.error("[runs] Failed", e);
    return error({ error: "run-failed", message: "Run failed; previous valid final retained. See server log." }, 503);
  }
}
