# PLAN · UI revamp to the Garden study (Workbook v3.0)

Draft · 2026-11-25 · Source of truth: `WebApp/UI_DESIGN_WORKBOOK.html` (v3.0, "Garden · Brabant · Clichy")

## 1. Goal

Move the Strategy Monitor from the current ivory/blue "handbook" look (commit `51f083f`) and the rotating painting header (`d8cda9d`) to the workbook's Garden study. Behaviour, data, engine and routes stay as they are. Only the presentation layer changes, plus the honesty and accessibility fixes the workbook requires.

Done means all 21 items in the workbook's §12 acceptance checklist pass, recorded in `reports/UI-v3.md`, and every deliberate departure is written down.

## 2. Where the app is today

| Area | Today | Workbook v3.0 target |
|---|---|---|
| Tokens | `--background #f7f5ef`, `--brand #355f87`, `--text #263449`, ad-hoc names (`globals.css:2-25`) | Role names: `--color-bg #d6d9c6` sage, `--color-surface #faf6ea` chalk, `--color-action #443c6b` violet, `--color-text #2c2a33`, state pairs, decorative `--d1..--d4` |
| Ground | Flat ivory | Sage plus the linen `--weave`; surfaces are opaque chalk |
| Type | Georgia h1 38px; h2 16px sans | Serif nameplate h1 46px, section 19px serif, italic serif eyebrows / table heads / captions, metric 38px serif with tabular numerals |
| Page header | `PageHeading` plus `ArtworkHeader`: 131-work Wikimedia catalogue, bag rotation, remote image | A painted field generated from the palette and seeded (Brabant swirls, ochre contours, Clichy ticks), with no external image |
| Decoration | None beyond the artwork | Ochre wavy `--contour` rule under the topbar, titles, dialog head and footer. One Clichy tick per block on eyebrows. Red-earth footer. Positional ochre/lavender/sage/earth bands on metric cards |
| Shape | Uniform radii | Slightly uneven "hand" radii (`--radius-panel`, `--radius-button`). Controls stay sharp |
| Breakpoints | 1100 / 767 / 639 | 1500 / 1150 / 900 / 650 (+ checks at 390 / 375 / 200% zoom) |
| Mobile nav | Bottom tab bar ≤767 | Icon rail (~60px) or drawer ≤650: pick one |
| States | `StateBadge` (ON / RISK CUT / OFF / KILL / UNCONFIRMED), `.warning`, `Empty` | Badge = colour + text always. Five distinct states: loading, empty, failed, unavailable, zero |
| Null values | `Num` prints "Unconfirmed" for every null | "—" + reason for unavailable; zero prints 0; "Unconfirmed" kept only as a labelled validation state |
| Dialog | None (the snapshot editor is inline) | Native `<dialog>` + `showModal()` pattern for any modal |
| Charts | Hard-coded hexes in `*-charts.tsx` (`#84621e`, `#355f87`, `#dedfd9`…) | Fixed chart tokens. Never sampled from a painting; ochre never carries meaning |

Housekeeping found on the way:
- `UI_HANDBOOK.md` is **deleted but not committed** in the working tree, and `UI_DESIGN_WORKBOOK.html` is untracked. The workbook still calls itself the "companion to UI_HANDBOOK.md" and says the ivory/blue Appendix A lives there.
- `tests/e2e/handbook.spec.ts` asserts the old ivory body colour `rgb(247,245,239)` and the painting rotation, so it has to be rewritten.
- `src/app/(dashboard)/[section]/page.tsx` is a leftover milestone placeholder with its own heading markup, outside `PageHeading`.

## 3. Decisions needed before Phase 1

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Header imagery.** Replace the rotating painting catalogue with the seeded, generated painted field, or keep the rotation re-skinned? | **Replace.** The workbook's default is "generated from the palette, not cut from a painting". It removes the remote Wikimedia dependency, the attribution and rights burden, and the rotation edge cases. Keep `src/ui/artwork*` in git history only. |
| D2 | **Mobile navigation ≤650px**: icon rail, drawer, or keep the bottom tab bar? | **Keep the bottom tab bar and record it as a deliberate departure.** It is better for one-handed phone checks and is already tested. If you would rather stay strictly on-spec, use the icon rail. |
| D3 | **Chart palette** | **Settled by the workbook (updated 2026-11-25):** `--series-1..8` in fixed order, never cycled; sequential `--seq-*` (violet), second sequential `--seq2-*` (red earth), diverging violet ↔ grey ↔ red earth; `--status-good/warning/serious/critical` for good/bad chart marks with icon + label; `--chart-surface/grid/axis/ink/ink-2`. Slots 3 and 7 (under 3:1) need direct labels or a table view. |
| D4 | **Gate state → semantic mapping** | ON → success, RISK CUT → warning, OFF → neutral, KILL → danger, UNCONFIRMED → neutral with the text "Unconfirmed", Provisional → active (violet). Red earth is never used for KILL. |
| D5 | **UI_HANDBOOK.md**: restore it or let the workbook stand alone? | Restore it from `HEAD` (it holds Appendix A and the rotation spec the workbook refers to), add a short note that v3 is the Garden study, and commit both files together. |

## 4. Phases

Each phase ends with `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` green and one commit.

### Phase 0: Baseline and decisions (½ day)
- Settle D1–D5 and commit the workbook (and the handbook, if restored).
- Capture "before" screenshots at 1440 / 1150 / 900 / 650 / 390 / 375 for Today, Gate, Puts, Portfolio, Monitor, Backtest, Rules and Login → `reports/ui-v3-before/`.
- Fill in the workbook's §2 product worksheet: product = Strategy Monitor; primary task = the daily close decision; key metrics = gate state, today's actions, drawdown vs kill; departures = from D2 and D3.

### Phase 1: Tokens and global foundation (1 day)
`src/app/globals.css`, `src/app/layout.tsx`
- Replace the `:root` block with the workbook's token set (use the workbook's "Copy token CSS" output verbatim), plus `--contour`, `--ticks`, `--weave`, the radii and `--serif` / `--mono` stacks. No remote fonts.
- Keep temporary aliases (`--brand → --color-action`, `--background → --color-bg`, …) so existing selectors keep working. Remove the aliases in Phase 7.
- Base type scale: h1 46px serif, h2 19px serif, body 14px, supporting 12px, `.eyebrow` 14px italic serif, and `font-variant-numeric: tabular-nums` on metrics and table numbers.
- Focus ring: 3px violet outline with offset plus a soft ochre halo (`box-shadow`), on every interactive element including `input`, `select` and `textarea`.
- Body = sage + weave. Cards, tables, inputs, nav and topbar = opaque chalk.
- Exit: the contrast pairs from workbook §3 asserted in a Vitest unit test (`tests/ui/contrast.test.ts`) against the token values.

### Phase 2: Shell and layout (1 day)
`src/components/shell.tsx`, `src/app/(dashboard)/layout.tsx`, `globals.css`
- Sidebar: chalk, ~220px (>1150), ~206px (≤1150). Violet active item on `--color-active-bg`. Serif "Strategy Monitor" nameplate.
- Topbar ~65px with the ochre contour rule underneath (a decorative `::after`, `aria-hidden`).
- Footer in red earth (`--d4`) with chalk text. Check the contrast; if it fails, keep the text on chalk with only an earth band.
- Breakpoints become 1500 / 1150 / 900 / 650. Main max-width 1540px.
- Mobile nav per D2. Icons keep `aria-label`s and collapsing the sidebar still works.
- Keep the skip link and `<main id="main">`, mounted once.

### Phase 3: Page heading and hero field (1–1.5 days)
New `src/components/garden-field.tsx` (and `src/ui/garden-field.ts` for the pure generator). Rewrite `page-heading.tsx`.
- Port the workbook's seeded generator (`sky`, `earth`, `ticks`, `lines` in its script) to a pure function `(seed, width, height, palette) → SVG`, rendered server-side as inline SVG. There is no canvas, no animation, and no layout shift while loading.
- The seed is derived from the route so each page has a stable field. It paints the same on every visit, per the workbook.
- The field is `aria-hidden`, sits beside or above the text and never behind it, collapses at ≤900px, and is hidden on compact headings at ≤650px.
- Title gets the ochre contour rule. Eyebrow gets a single Clichy tick.
- If D1 = replace: delete `artwork-header.tsx`, `src/ui/artwork.ts`, `artwork-catalog.json`, `tools/build-art-catalog.mjs`, `public/art/*`, the `art:catalog` script and `tests/artwork.test.ts`. Update `THIRD_PARTY_NOTICES.md` and `public/art/README.md`.
- Unit test: same seed → byte-identical SVG, and output contains no `<text>`.

### Phase 4: Component kit (1.5 days)
Consolidate into `src/components/ui/` (or extend `dashboard-ui.tsx`):
- **Button**: primary (violet + thin ochre lip), secondary, link-as-button, disabled, and busy ("Starting…", blocks duplicate submits). Apply to `run-now.tsx`, `portfolio-editor.tsx`, `monitor-editor.tsx`, `login-form.tsx`, `strategy-switcher.tsx` (segmented). Every non-submit button gets `type="button"`.
- **StatusBadge**: one component, mapping per D4, icon + text, unknown → neutral. Replaces `StateBadge`, `.chip.warning`, and the Pass / Fail / Close call / Unverified chips.
- **Alert**: error (`role="alert"`), partial-coverage warning, info tip. Replaces `.notice`, `.warning`, `ContextNotice`, `.validation-issues` styling.
- **MetricCard**: serif tabular value, label, a denominator/basis line, and a positional `--d1..--d4` top band by grid order only. Used for the KPI grid, backtest KPIs and monitor checklist.
- **Form field**: visible label, hint, error linked via `aria-describedby`, sage-grey `--color-line` border (never ochre).
- **DataTable**: chalk, italic-serif headers, numeric columns right-aligned and tabular, focusable horizontal scroll region (`tabIndex=0`, `role="region"`, `aria-label`) instead of the current ≤639px card-stacking, and `<details>` row diagnostics. Applies to Today's actions, put tables, journal, monitor and backtest tables.
- **Dialog**: native `<dialog>` + `showModal()`, labelled title, focus to close, Escape/backdrop close, focus restored, scrolling body, `min(1100px, 94vw)` / 92vh desktop and 97vw / 96vh mobile. First use: move the portfolio snapshot editor into it (optional; see Risks).
- **Working popover** (`working.tsx`): restyle to chalk + contour only, behaviour unchanged.

### Phase 5: Data-honesty states (1 day)
`dashboard-ui.tsx` (`Num`, `RunNum`, `Empty`) and all pages
- Split null handling into an explicit `status` prop: `unavailable` → "—" plus a visible reason ("Not measured", "Awaiting warm-up"); `unconfirmed` → the "Unconfirmed" text badge (market not validated); `0` → "0". Never let a failed load fall into the empty state.
- A `StateView` component for loading (skeleton, fixed height, no reflow), empty (with one action), failed (with Retry), unavailable and zero.
- Show denominators beside percentages: monitor pass counts ("x of y checks"), backtest win rate ("n of 277 puts"), drawdown basis ("peak of entered snapshots").
- Gate and backtest charts: when history is truncated by the earliest input file, show it in a caption next to the chart.

### Phase 6: Page-by-page pass (2 days)
In order: **Today → Gate → Puts → Portfolio → Monitor → Backtest → Rules → Login**, then delete or redirect the `[section]` placeholder.
- One h1 per page through `PageHeading`, with a task description. One primary action per task area.
- Charts (`gate-charts`, `monitor-charts`, `backtest-charts`, returns heatmap): use the workbook chart tokens through one shared `src/ui/chart-theme.ts`. 2px lines, recessive grid, one axis, direct labels at the line ends plus a legend, keyboard crosshair (Recharts accessibility layer), a "Show as table" disclosure, chalk plot area, no brushwork under figures. Gate bands use chart status colours with text labels; the monthly-returns heatmap uses the diverging ramp with signed values printed in each cell.
- Today's decision hero: the gate badge carries the state. The positional band stays decorative, so the hero no longer turns colour by state.
- Login: chalk card on sage + field. It is the first screen, so it gets the full treatment.

### Phase 7: Cleanup, tests, evidence (1 day)
- Remove the token aliases and dead selectors (`.inline-chip`, `.hero-card`, `.placeholder`, `.collapsed` leftovers…). `globals.css` should shrink, not grow.
- Rewrite `tests/e2e/handbook.spec.ts` → `garden.spec.ts`: sage body colour, one h1, no horizontal overflow at 1440 / 1150 / 900 / 650 / 390 / 375, a stable field across reloads, a dialog keyboard flow, the skip link, the five states (via fixture variants in `.e2e-data/`), and table scroll regions focusable.
- Add axe-core checks to Playwright (`@axe-core/playwright`, dev-only) on every page.
- Run at 200% zoom and with `prefers-reduced-motion`.
- Tick the §12 checklist in the workbook and record the results in `reports/UI-v3.md` with "after" screenshots in `reports/ui-v3-after/`.
- Update the README "UI and dependency choices" (it still says "deep-green shell"), then `pnpm build` (parity gate) and `E2E_PRODUCTION=1 pnpm test:e2e`.

## 5. Estimate and sequencing

About **9–10 working days** for one developer or agent. Phases 1→2→3 are sequential. Phase 4 can start in parallel with Phase 3 once tokens land. Phases 5 and 6 depend on 4. Ship behind no flag: it is a single-user app, so each phase merges straight to `main` after its gates are green.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sage ground lowers contrast for muted text on the bg (not on chalk) | Muted text only ever on chalk. The contrast unit test covers `--color-muted` on both. |
| Generated field looks crude compared with the workbook | Port the workbook's generator code directly rather than re-inventing it. Compare side-by-side at 1440. |
| Table card-stacking removal hurts phone reading of Today's actions | Keep a 2-column "key facts" summary above the scroll table on ≤650px if the review at 375px shows it's needed. |
| Moving the snapshot editor into a dialog breaks the e2e tests from `e9f1f4e` / `efa1918` | Do it last in Phase 4, or defer. It is optional for workbook compliance. |
| Ochre and olive series fall under 3:1 on chalk | Per the workbook: any chart using slot 3 or 7 gets direct labels or a table view. The contrast test asserts the other series tokens reach 3:1. |
| Scope creep into engine or data changes | Out of scope. Any data-honesty gap that needs new fields becomes a separate ticket. |

## 7. Out of scope
Dark mode (the workbook defines none), new pages or metrics, engine/run logic, auth, deployment changes.
