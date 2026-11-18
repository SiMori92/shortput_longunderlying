import { z } from "zod";
import { DateSchema, NumberSchema } from "./common";
export const FeatureSchema = z.strictObject({
  date: DateSchema, S: NumberSchema, H: NumberSchema, L: NumberSchema, REF: NumberSchema, SPY: NumberSchema, VIX: NumberSchema, RF: NumberSchema,
  RV10: NumberSchema, RV20: NumberSchema, RV60: NumberSchema, RVfast: NumberSchema, IV_ATM: NumberSchema,
  REF_SMA50: NumberSchema, REF_SMA200: NumberSchema, S_SMA20: NumberSchema.nullable(), S_SMA50: NumberSchema.nullable(), S_SMA100: NumberSchema.nullable(),
  unadj: NumberSchema, is_expiry: z.boolean(), week_id: z.string(),
});
export const GateSchema = z.strictObject({ a: z.boolean(), b: z.boolean(), c: z.boolean(), gateOn: z.boolean(), mult: NumberSchema, putOk: z.boolean() });
export const PositionSchema = z.strictObject({ K: NumberSchema, expiry: DateSchema, qty: NumberSchema, credit: NumberSchema, open: DateSchema, value: NumberSchema });
export const TradeSchema = z.strictObject({ kind: z.literal("P"), open: DateSchema, close: DateSchema, K: NumberSchema, Kw: z.null(), credit: NumberSchema, exit: NumberSchema, pnl: NumberSchema, notional: NumberSchema, assigned: z.boolean(), how: z.enum(["profit", "expiry"]) });
export const ReplayDaySchema = z.strictObject({ date: DateSchema, equity: NumberSchema, core_w: NumberSchema, put_w: NumberSchema, regime: z.boolean(), dd: NumberSchema,
  cash: NumberSchema, coreQty: NumberSchema, coreTrade: NumberSchema, executedTarget: NumberSchema, previousEquity: NumberSchema, coreTarget: NumberSchema, gate: GateSchema, positions: z.array(PositionSchema) });
export const MetricsSchema = z.record(z.string(), z.union([NumberSchema, z.string(), z.null()]));
export const PeriodReturnsSchema = z.record(z.string(), NumberSchema);
export const ReplayFixtureSchema = z.strictObject({ rulesId: z.enum(["v3_1", "v3_archived"]), start: DateSchema, end: DateSchema, capital: NumberSchema,
  days: z.array(ReplayDaySchema), trades: z.array(TradeSchema), metrics: MetricsSchema, yearly: PeriodReturnsSchema, monthly: PeriodReturnsSchema });
export const BacktestResultSchema = ReplayFixtureSchema.extend({ schemaVersion: z.literal(1), coreTrades: z.array(z.strictObject({ date: DateSchema, qty: NumberSchema, price: NumberSchema, slippage: NumberSchema })), entries: z.array(PositionSchema.extend({ mid: NumberSchema })) });
