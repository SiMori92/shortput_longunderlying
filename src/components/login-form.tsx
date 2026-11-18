"use client";
import { useState } from "react";
import { KeyRound, LogIn, UserRound } from "lucide-react";
import { AuthResponseSchema } from "@/schemas/auth";
export function LoginForm({ configured }: { configured: boolean }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const form = event.currentTarget, fields = new FormData(form);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: fields.get("username"), password: fields.get("password") }) });
      const result = AuthResponseSchema.parse(await response.json());
      if (response.ok && result.ok) { form.reset(); window.location.replace("/"); }
      else setMessage(result.message);
    } catch { setMessage("Unable to sign in. Check the connection and retry."); }
    finally { setPending(false); }
  }
  return <form className="portfolio-editor login-form" onSubmit={submit}>
    {!configured && <p className="warning" role="status">Setup required · Run <code>pnpm auth:setup</code> on the server, then restart.</p>}
    <label htmlFor="username"><UserRound size={18}/>Account name<input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} disabled={!configured || pending}/></label>
    <label htmlFor="password"><KeyRound size={18}/>Password<input id="password" name="password" type="password" autoComplete="current-password" required maxLength={72} disabled={!configured || pending}/></label>
    <button className="button primary" type="submit" disabled={!configured || pending}><LogIn size={18}/>{pending ? "Signing in…" : "Sign in"}</button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
