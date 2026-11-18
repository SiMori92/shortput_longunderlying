import { z } from "zod";
export const HealthSchema = z.strictObject({ status: z.literal("ok"), milestone: z.literal("M8"), strategyReady: z.literal(false) });
