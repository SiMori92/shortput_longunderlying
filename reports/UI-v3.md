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

1. **Mobile navigation (≤650px) stays a bottom tab bar**, not the workbook's icon rail or drawer. It is better for one-handed phone checks, every target is ≥44px and each link keeps its accessible name. (Plan D2.)
Chart colours are no longer a departure: the workbook (updated 2026-11-25) defines them, and the app uses its tokens.

## Baseline (Phase 0)

- Before screenshots: `reports/ui-v3-before/` (1440 / 900 / 375, JPEG).
- Baseline gates on `cc7e09d`: lint, typecheck and 154 unit tests pass. E2E 42 of 43 passed; `monitor.spec.ts` "manual IV and quotes persist…" timed out waiting for "Observation saved" in the full run and passed when rerun alone. This is pre-existing flakiness, not caused by the revamp.

## Result (Phase 7, 2026-11-25)

Commits on branch `ui-garden-v3`: phase 0 `5a30468`, chart tokens `f1ae516`, phase 1 `1db9b9d`, phase 2 `2d3a225`, phase 3 `23fa550`, phase 4 `ace2150`, phase 5 `3239a5b`, phase 6 `fce7116`, phase 7 (this commit).

| Gate | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | Pass |
| `pnpm test` (Vitest, includes Python parity) | 189 passed |
| `pnpm build` | Pass |
| `pnpm test:e2e` (dev) | 45 passed |
| `E2E_PRODUCTION=1 pnpm test:e2e` | 45 passed |

After screenshots: `reports/ui-v3-after/` (1440 / 900 / 375, JPEG), alongside `reports/ui-v3-before/`.

## Acceptance checklist (workbook §12)

| Item | Status | Evidence |
|---|---|---|
| Core colour tokens match the worksheet; decorative accents do not encode status | Pass | `:root` in `globals.css` copied from the workbook; `--d1..--d4` used only for bands, rules and the painted field |
| Titles use the display face; controls and data use sans | Pass | h1/h2 serif; controls, tables, figures sans (metrics serif tabular as in the workbook) |
| One H1 and a task description per page | Pass | `garden.spec.ts` "every page has one H1…"; error and invalid-query paths keep `PageHeading` |
| Brushwork only in decorative zones; tables and inputs opaque | Pass | Painted field behind the plaque only; text on opaque chalk (`garden.spec.ts` checks plaque background) |
| Decorative assets attributed with a rights record | Pass (N/A) | No paintings shipped; the field is generated in code. Painting catalogue removed |
| Checked 1440, 1150, 900, 650, 390, 375 (and either side) | Pass | `garden.spec.ts` widths 1440/1151/1150/900/651/650/390/375 |
| Sidebar widths and offsets agree; icons keep names on mobile | Pass | Grid columns 220/206/76px; every nav link has `aria-label`; 44px targets checked in `shell.spec.ts` |
| No horizontal page overflow; wide tables scroll internally | Pass | Overflow asserted on every page and width; `a11y.spec.ts` scrolls the heatmap region by keyboard |
| Long titles and captions wrap without covering controls | Pass | Visual review of after screenshots; flex-wrap on headings, topbar and chips |
| At 200% zoom content is operable; dialogs keep actions reachable | Pass | `a11y.spec.ts` 720px case. No dialogs in the app |
| Keyboard reaches navigation, actions, filters, table disclosures | Pass | Native links/buttons/details; table regions `tabindex=0`; charts focusable |
| Skip link targets main; focus visible | Pass | `a11y.spec.ts` skip link and focus-outline tests |
| Dialog title, focus, Escape, restoration | N/A | No modal flows. The snapshot editor stays inline (plan allowed deferring it) |
| Statuses and errors use text + colour; fields labelled | Pass | `Badge`/`StateBadge` always carry text; field errors linked with `aria-describedby` |
| Essential text meets contrast, including new state combinations | Pass | `tests/ui/contrast.test.ts` (tokens read from CSS) + axe colour-contrast on every page |
| Reduced motion respected; compact controls enlarged for touch | Pass | `a11y.spec.ts` reduced-motion check; 44px minimum targets |
| Loading, empty, error, zero, unavailable tested separately | Pass | `loading.tsx`, `error.tsx`, `Unavailable`; `garden.spec.ts` failed-state and unavailable/zero tests |
| Failures and incomplete coverage visible beside headline metrics | Pass | Metric cards carry basis/denominator lines; checks and facts "x of y" on Monitor |
| Null/unavailable shows em dash; zero shows zero | Pass | `Num` `unavailable` mode; heatmap months outside the window show "—" (tested) |
| Charts use `--series-*` in fixed order; 9th series folds into Other; scatter/maps slots 1–3 | Pass | At most 3 series per chart, slots 1–3 in order; no scatter or map charts |
| Series 3 and 7 ship with direct labels or a table view; status marks have icon + label | Pass | Every multi-series chart has end labels and a "Show as table" view; gate bands legend uses icons |
| (If rotating) imagery items | N/A | Rotation removed (plan D1) |

Also fixed along the way: the Monitor save redirected through `/spax`, which remounted the form and dropped the "Observation saved" message (the pre-existing e2e flake); chart frames used `aria-label` on plain `div`s (now `role="figure"`).

## Notes for maintainers

- The e2e dev/prod servers register the real NYSE cron jobs (15:40 and 16:20 New York time on weekdays). A run that spans one of those times fetches live Yahoo data into `.e2e-data` and breaks tests that assert seed-era figures (for example the Puts model equity). If that happens, move `.e2e-data` aside so the server re-seeds it. This predates the UI work.
- Monthly returns use the workbook's diverging ramp literally: below zero is violet, above zero is red earth. Each cell prints its signed value and a legend states the mapping.
- App icons (`public/icon.svg`, PNGs) still use the previous dark-green mark.
