"use client";
import { LogOut } from "lucide-react";
import { useState } from "react";
export function Logout() {
  const [failed, setFailed] = useState(false);
  async function logout() {
    try { const result = await fetch("/api/auth/logout", { method: "POST" }); if (result.ok || result.status === 401) window.location.replace("/login"); else setFailed(true); }
    catch { setFailed(true); }
  }
  return <button className="icon-button" onClick={logout} aria-label={failed ? "Sign out failed. Retry sign out" : "Sign out"} title={failed ? "Sign out failed · retry" : "Sign out"}><LogOut size={18}/></button>;
}
