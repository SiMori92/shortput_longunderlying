import { z } from "zod";
import { DateSchema, NumberSchema, PositiveSchema, SymbolSchema } from "./common";
const fraction = NumberSchema.min(0).max(1);
export const RulesSchema = z.strictObject({
  id: z.enum(["v3_1", "v3_archived"]), version: z.string(), archived: z.boolean(),
  gateMode: z.enum(["risk-cut", "all-conditions"]), smaFast: PositiveSchema.int(), smaSlow: PositiveSchema.int(), rvSpike: PositiveSchema, riskCutMultiplier: fraction,
  coreVolTarget: PositiveSchema, coreCap: fraction, coreBand: fraction,
  targetDelta: fraction, tenorWeeks: PositiveSchema.int(), entryLastWeekday: z.number().int().min(0).max(4), notionalPerWeek: fraction, maxPutNotional: fraction, profitTake: fraction,
  gapBudget: fraction, gapSize: fraction.positive(), ivPremium: PositiveSchema, ivMin: PositiveSchema, ivMax: PositiveSchema, skew: NumberSchema.nonnegative(), premiumSlippage: fraction, commission: NumberSchema.nonnegative(), stockSlippage: fraction, marginSpread: fraction, killDrawdown: NumberSchema.min(-1).max(0),
  splits: z.array(z.strictObject({ date: DateSchema, factor: PositiveSchema })),
}).refine(r => r.smaFast < r.smaSlow && r.ivMin <= r.ivMax && r.notionalPerWeek <= r.maxPutNotional, "Invalid rule bounds");
const fact = z.union([z.literal("unconfirmed"), z.strictObject({ value: z.union([z.string(), NumberSchema, z.boolean()]), source: z.url(), checkedAt: z.iso.datetime() })]);
export const UnderlyingsSchema = z.array(z.strictObject({
  symbol: SymbolSchema, role: z.enum(["trade", "monitor", "reference", "input"]), leverage: PositiveSchema.nullable(), reference: SymbolSchema.nullable(), seedFile: z.string().regex(/^[A-Z^][A-Z0-9.^-]*\.csv$/).nullable(),
  facts: z.strictObject({ launchDate: fact, yahooSymbol: fact, issuer: fact, expenseRatio: fact, listedOptions: fact, aum: fact, volume: fact }).optional(),
})).refine(items => new Set(items.map(i => i.symbol)).size === items.length, "Duplicate underlying");
export type Rules = z.infer<typeof RulesSchema>;
