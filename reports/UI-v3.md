# UI v3 · Garden study adoption

Workbook: `UI_DESIGN_WORKBOOK.html` v3.0 · Plan: `PLAN - UI revamp to garden study v3.md` · Branch `ui-garden-v3`

## Product definition (workbook §2)

| Field | Value |
|---|---|
| Product name | Strategy Monitor |
| Primary task | Read the close decision for the selected strategy (SOXL / SPAX), confirm account readiness, and act on today's model actions |
| Key decision metrics | Gate state (ON / RISK CUT / OFF / KILL / UNCONFIRMED); today's core and put actions; drawdown vs kill threshold; gap budget |
| Deliberate departures | See below |

## Deliberate departures

1. **Mobile navigation (≤767px) stays a bottom tab bar**, not the workbook's icon rail or drawer. It is better for one-handed phone checks, every target is ≥44px and each link keeps its accessible name. (Plan D2.)
2. **Chart series colours** are not defined by the workbook. Series 1 = garden violet `--color-action`, series 2 = `--chart-2` blue-grey, threshold/reference = `--color-muted` dashed. Gate bands use state backgrounds, never decorative accents. (Plan D3.)

## Baseline (Phase 0)

- Before screenshots: `reports/ui-v3-before/` (1440 / 900 / 375, JPEG).
- Baseline gates on `cc7e09d`: lint, typecheck and 154 unit tests pass. E2E 42 of 43 passed; `monitor.spec.ts` "manual IV and quotes persist…" timed out waiting for "Observation saved" in the full run and passed when rerun alone. This is pre-existing flakiness, not caused by the revamp.
