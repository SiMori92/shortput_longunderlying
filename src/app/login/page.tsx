import { LockKeyhole } from "lucide-react";
import { SunMark } from "@/components/sun-mark";
import { GardenField } from "@/components/garden-field";
import { LoginForm } from "@/components/login-form";
import { authConfig } from "@/auth/config";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <main className="login-screen"><section className="card login-card"><span className="brand-mark"><SunMark size={30}/></span><p className="eyebrow">Strategy Monitor</p><h1>Private workspace</h1><p className="muted"><LockKeyhole size={16} aria-hidden="true"/> Account name + password</p><LoginForm configured={!!authConfig()}/></section><GardenField mode="foot" seed={1890} className="login-field"/></main>;
}
