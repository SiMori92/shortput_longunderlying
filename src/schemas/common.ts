import { z } from "zod";
export const DateSchema = z.iso.date();
export const NumberSchema = z.number().finite();
export const PositiveSchema = NumberSchema.positive();
export const SymbolSchema = z.string().regex(/^[A-Z^][A-Z0-9.^-]{0,19}$/);
export const StateSchema = z.enum(["ON", "RISK CUT", "OFF", "KILL"]);
export const WorkingSchema = z.strictObject({ formula: z.string(), inputs: z.record(z.string(), z.union([NumberSchema, z.string(), z.boolean(), z.null()])), result: z.union([NumberSchema, z.string(), z.boolean(), z.null()]) });
