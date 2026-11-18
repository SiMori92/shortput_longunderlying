import { redirect } from "next/navigation";
/** The SPAX tab became the ticker-aware Monitor page; pick SPAX in the header switcher. */
export default function LegacySpax() { redirect("/monitor"); }
