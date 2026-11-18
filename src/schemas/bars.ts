import { z } from "zod";
import { DateSchema, NumberSchema, SymbolSchema } from "./common";
// ^IRX can be negative. OHLC positivity belongs to instrument-specific validation.
export const BarSchema = z.strictObject({ date: DateSchema, open: NumberSchema, high: NumberSchema, low: NumberSchema, close: NumberSchema, volume: NumberSchema.nonnegative(), adjclose: NumberSchema.nullable() }).refine(b => b.high >= b.low && b.high >= Math.max(b.open, b.close) - 1e-8 && b.low <= Math.min(b.open, b.close) + 1e-8, "Inconsistent OHLC");
export const BarsSchema = z.strictObject({ schemaVersion: z.literal(1), symbol: SymbolSchema, source: z.enum(["seed", "yahoo"]), bars: z.array(BarSchema) }).superRefine((v, ctx) => {
  v.bars.forEach((b, i) => { if (i > 0 && b.date <= v.bars[i - 1]!.date) ctx.addIssue({ code: "custom", message: "Bars must have unique ascending dates", path: ["bars", i, "date"] }); });
});
export type Bars = z.infer<typeof BarsSchema>;
