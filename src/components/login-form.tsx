"use client";
import { useState } from "react";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { AuthResponseSchema } from "@/schemas/auth";
export function LoginForm({ configured }: { configured: boolean }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const form = event.currentTarget, fields = new FormData(form);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: fields.get("password"), token: fields.get("token") }) });
      const result = AuthResponseSchema.parse(await response.json());
      if (response.ok && result.ok) { form.reset(); window.location.replace("/"); }
      else setMessage(result.message);
    } catch { setMessage("Unable to sign in. Check the connection and retry."); }
    finally { setPending(false); }
  }
  return <form className="portfolio-editor login-form" onSubmit={submit}>
    {!configured && <p className="warning" role="status">Setup required · Run <code>pnpm auth:setup</code> on the server, then restart.</p>}
    <label htmlFor="password"><KeyRound size={18}/>Password<input id="password" name="password" type="password" autoComplete="current-password" required maxLength={72} disabled={!configured || pending}/></label>
    <label htmlFor="token"><ShieldCheck size={18}/>Authenticator code<input id="token" name="token" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="000000" required disabled={!configured || pending}/></label>
    <button className="button primary" type="submit" disabled={!configured || pending}><LogIn size={18}/>{pending ? "Signing in…" : "Sign in"}</button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
