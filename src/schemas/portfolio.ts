import { z } from "zod";
import { DateSchema, NumberSchema, PositiveSchema } from "./common";
import { StrategySymbolSchema } from "../strategy/symbols";
export const PortfolioPutSchema = z.strictObject({ id: z.string().min(1).max(100), symbol: StrategySymbolSchema, opened: DateSchema, strike: PositiveSchema, expiry: DateSchema, contracts: PositiveSchema.int().max(1000000), credit: NumberSchema.nonnegative() }).refine(p => p.expiry >= p.opened, { message: "Expiry precedes opening", path: ["expiry"] });
export const PortfolioEntrySchema = z.strictObject({ date: DateSchema, accountValue: PositiveSchema, shares: NumberSchema.nonnegative().int().max(1000000000), openPuts: z.array(PortfolioPutSchema).max(100) }).superRefine((p, ctx) => {
  if (new Set(p.openPuts.map(v => v.id)).size !== p.openPuts.length) ctx.addIssue({ code: "custom", path: ["openPuts"], message: "Duplicate put ID" });
  p.openPuts.forEach((v, i) => { if (v.opened > p.date) ctx.addIssue({ code: "custom", path: ["openPuts", i, "opened"], message: "Opening is after snapshot" }); });
});
export const PortfolioEntriesSchema = z.array(PortfolioEntrySchema).refine(v => new Set(v.map(x => x.date)).size === v.length, "Duplicate snapshot date");
export const JournalEntrySchema = z.strictObject({ id: z.string().min(1).max(100), date: DateSchema, runId: z.string().min(1), recommendation: z.string().max(10000), done: z.string().trim().min(1).max(4000), note: z.string().max(4000) });
export const JournalSchema = z.array(JournalEntrySchema).refine(v => new Set(v.map(x => x.id)).size === v.length, "Duplicate journal ID");
export const PortfolioStateSchema = z.strictObject({ revision: z.string().regex(/^[a-f0-9]{64}$/), entries: PortfolioEntriesSchema, journal: JournalSchema });
export const PortfolioCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("snapshot"), revision: z.string().regex(/^[a-f0-9]{64}$/), entry: PortfolioEntrySchema }),
  z.strictObject({ operation: z.literal("journal"), revision: z.string().regex(/^[a-f0-9]{64}$/), date: DateSchema, done: z.string().trim().min(1).max(4000), note: z.string().max(4000) }),
]);
export const PortfolioErrorSchema = z.strictObject({ error: z.enum(["unauthorized", "forbidden", "invalid-input", "conflict", "unavailable"]), message: z.string() });
export type PortfolioEntry = z.infer<typeof PortfolioEntrySchema>;
export type PortfolioState = z.infer<typeof PortfolioStateSchema>;
export type PortfolioCommand = z.infer<typeof PortfolioCommandSchema>;
