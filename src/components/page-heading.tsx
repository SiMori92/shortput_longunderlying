import type { ReactNode } from "react";
import { ArtworkHeader } from "./artwork-header";

export function PageHeading({ eyebrow, title, description, action, compact = false }: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return <header className={`page-heading${compact ? " page-heading-compact" : ""}`}>
    <div className="page-heading-content">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p className="page-heading-description">{description}</p>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
    <ArtworkHeader />
  </header>;
}
