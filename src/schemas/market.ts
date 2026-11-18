import { z } from "zod";
import { DateSchema, NumberSchema, SymbolSchema } from "./common";
export const DataIssueSchema = z.strictObject({ code: z.enum(["fetch", "schema", "partial", "split", "stitch", "missing", "stale", "move", "calendar", "identity", "history", "account"]), symbol: SymbolSchema.nullable(), message: z.string(), blocking: z.boolean() });
export type DataIssue = z.infer<typeof DataIssueSchema>;
export const SymbolStatusSchema = z.strictObject({ symbol: SymbolSchema, lastDate: DateSchema.nullable(), expectedDate: DateSchema, count: z.number().int().nonnegative(), provisional: z.boolean(), updated: z.boolean(), issues: z.array(DataIssueSchema) });
export const SplitSchema = z.strictObject({ date: DateSchema, factor: NumberSchema.positive() });
export const KnownSplitsSchema = z.record(SymbolSchema, z.array(SplitSchema));
export const MarketFactsSchema = z.strictObject({ checkedAt: z.iso.datetime(), symbol: SymbolSchema, yahooSymbol: z.union([z.literal("unconfirmed"), z.strictObject({ value: SymbolSchema, source: z.url() })]), volume: z.union([z.literal("unconfirmed"), z.strictObject({ value: NumberSchema.nonnegative(), asOf: DateSchema, source: z.url() })]), launchDate: z.literal("unconfirmed"), issuer: z.literal("unconfirmed"), expenseRatio: z.literal("unconfirmed"), listedOptions: z.literal("unconfirmed"), aum: z.literal("unconfirmed"), warnings: z.array(z.string()) });
