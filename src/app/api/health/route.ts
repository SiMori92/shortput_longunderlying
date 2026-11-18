import { HealthSchema } from "@/schemas/api";
export function GET() {
  return Response.json(HealthSchema.parse({ status: "ok", milestone: "M8", strategyReady: false }), { headers: { "Cache-Control": "no-store" } });
}
