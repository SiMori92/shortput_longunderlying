import { z } from "zod";
export const AuthResponseSchema = z.strictObject({ ok: z.boolean(), message: z.string() });
export const UnauthorizedResponseSchema = z.strictObject({ error: z.literal("unauthorized"), message: z.string() });
