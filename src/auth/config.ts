import { z } from "zod";
export const AuthConfigSchema = z.object({
  AUTH_PASSWORD_HASH: z.string().regex(/^\$2[aby]\$(1[0-4])\$[./A-Za-z0-9]{53}$/),
  AUTH_TOTP_SECRET: z.string().regex(/^[A-Z2-7]{32,128}$/),
  SESSION_SECRET: z.string().min(32).max(512),
  APP_ORIGIN: z.url().refine(s => { const u = new URL(s); return u.origin === s && (u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))); }),
});
export function authConfig() { const result = AuthConfigSchema.safeParse(process.env); return result.success ? result.data : null; }
