import type { ReactNode } from "react";
import { GardenField } from "./garden-field";
import { seedFor } from "@/ui/garden-field";

/**
 * Page identity: a chalk plaque (eyebrow, the page's single H1, task description, one action) set on a
 * seeded painted field. Text never sits on the brushwork; the field is decoration and hidden from assistive tech.
 */
export function PageHeading({ eyebrow, title, description, action, compact = false }: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return <header className={`page-heading${compact ? " page-heading-compact" : ""}`}>
    <GardenField mode="hero" seed={seedFor(description)} />
    <div className="page-plaque">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p className="page-heading-description">{description}</p>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
  </header>;
}
