import { MonitorResultSchema } from "./monitor";
import { z } from "zod";
import { DateSchema, NumberSchema, PositiveSchema, StateSchema, WorkingSchema } from "./common";
import { DataIssueSchema, SymbolStatusSchema } from "./market";
export const RunInputSchema = z.strictObject({ type: z.enum(["preview", "final", "catchup"]), date: DateSchema.optional() });
const condition = z.strictObject({ value: NumberSchema, threshold: NumberSchema, distance: NumberSchema, passes: z.boolean(), closeCall: z.boolean() });
const action = z.strictObject({ kind: z.enum(["core", "sell-put", "buy-back", "expiry"]), description: z.string(), modelQuantity: NumberSchema, roundedQuantity: z.number().int(), modelPrice: NumberSchema.nullable() });
const limit = z.strictObject({ name: z.enum(["weekly", "total", "gap"]), modelQuantity: NumberSchema.nonnegative().nullable(), binds: z.boolean() });
const check = z.strictObject({ id: z.enum(["history", "trend", "vol", "premium", "options", "unlocks"]), status: z.enum(["pass", "fail", "unconfirmed", "provisional"]), value: z.union([NumberSchema, z.string(), z.null()]) });
export const RunResultSchema = z.strictObject({
  schemaVersion: z.literal(1), id: z.string(), type: RunInputSchema.shape.type, timestamp: z.iso.datetime(), asOf: DateSchema, rulesId: z.literal("v3_1"),
  freshness: z.strictObject({ status: z.enum(["valid", "provisional", "blocked"]), issues: z.array(DataIssueSchema), symbols: z.array(SymbolStatusSchema), actionsBlocked: z.boolean() }),
  gate: z.strictObject({ a: condition, b: condition, c: condition, state: StateSchema, gateOn: z.boolean(), multiplier: NumberSchema, putOk: z.boolean() }).nullable(),
  core: z.strictObject({ price: PositiveSchema, rvFast: NumberSchema.nonnegative(), previousEquity: PositiveSchema, targetWeight: NumberSchema, modelShares: NumberSchema, roundedShares: z.number().int(), bandValue: NumberSchema, timing: z.literal("next-close-estimate"), trade: action.nullable() }).nullable(),
  put: z.strictObject({ pricing: z.literal("model"), strike: PositiveSchema, expiry: DateSchema, delta: NumberSchema, mid: NumberSchema, credit: NumberSchema, limits: z.array(limit).length(3), modelContracts: NumberSchema, contracts: z.number().int().nonnegative(), eligible: z.boolean() }).nullable(),
  openPutActions: z.array(action),
  account: z.strictObject({ equity: PositiveSchema, peak: PositiveSchema, peakBasis: z.literal("entered-snapshots"), drawdown: NumberSchema, coreWeight: NumberSchema, putNotionalWeight: NumberSchema, gapUsed: NumberSchema, kill: z.boolean() }).nullable(),
  spax: z.strictObject({ verdict: z.enum(["NOT READY", "WATCH", "READY TO BACKTEST"]), checks: z.array(check).length(6), warnings: z.array(z.string()), monitor: MonitorResultSchema.optional() }),
  changesSincePreview: z.array(z.string()), working: z.record(z.string(), WorkingSchema),
});
export const RunErrorSchema = z.strictObject({ error: z.enum(["unauthorized", "forbidden", "invalid-input", "busy", "run-failed"]), message: z.string() });
export const RunResponseSchema = z.union([RunResultSchema, RunErrorSchema]);
export type RunResult = z.infer<typeof RunResultSchema>;
