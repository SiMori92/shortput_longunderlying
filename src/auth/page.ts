import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticated } from "./session";
/** Check each page before loading private data; layout checks alone are insufficient. */
export async function requirePageSession() {
  if (!authenticated(new Request("http://localhost", { headers: await headers() }))) redirect("/login");
}
