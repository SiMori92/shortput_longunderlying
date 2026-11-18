import { authenticated, sameOrigin } from "@/auth/session";
import { PortfolioCommandSchema, PortfolioErrorSchema, PortfolioStateSchema } from "@/schemas/portfolio";
import { PortfolioConflict, PortfolioInputError, readPortfolio, savePortfolio } from "@/portfolio/service";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function error(kind: "unauthorized" | "forbidden" | "invalid-input" | "conflict" | "unavailable", message: string, status: number) { return Response.json(PortfolioErrorSchema.parse({ error: kind, message }), { status, headers }); }
export async function GET(request: Request) {
  if (!authenticated(request)) return error("unauthorized", "Signed-in session required. Sign in to continue.", 401);
  try { return Response.json(PortfolioStateSchema.parse(await readPortfolio()), { headers }); } catch { return error("unavailable", "Stored portfolio failed validation.", 503); }
}
export async function PUT(request: Request) {
  if (!authenticated(request)) return error("unauthorized", "Signed-in session required. Sign in to continue.", 401);
  if (!sameOrigin(request)) return error("forbidden", "Same-origin request required.", 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") return error("invalid-input", "JSON body required.", 415);
  let input;
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error("Missing body");
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 65536) { await reader.cancel(); throw new Error("Too large"); } chunks.push(next.value); }
    input = PortfolioCommandSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { return error("invalid-input", "Invalid portfolio input (maximum 64KB). Check dates, whole quantities and nonnegative credits.", 400); }
  try { return Response.json(PortfolioStateSchema.parse(await savePortfolio(input)), { headers }); }
  catch (e) {
    if (e instanceof PortfolioConflict) return error("conflict", e.message, 409);
    if (e instanceof PortfolioInputError) return error("invalid-input", e.message, 400);
    console.error("[portfolio] Save failed", e); return error("unavailable", "Portfolio could not be saved. Reload before retrying.", 503);
  }
}
