import { Leaf, LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { authConfig } from "@/auth/config";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <main className="login-screen"><section className="card login-card"><span className="brand-mark"><Leaf size={28}/></span><p className="eyebrow">STRATEGY MONITOR</p><h1>Private workspace</h1><p className="muted"><LockKeyhole size={16}/> Account name + password</p><LoginForm configured={!!authConfig()}/></section></main>;
}
