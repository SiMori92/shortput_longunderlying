# Work plan: Strategy monitor web app (SOXL V3.1 + SPAX watch)

Revision 3, 18 Nov 2026. Status: **plan only.** No development has started. The build brief for the coding agent is [AGENT PROMPT - Strategy monitor build.md](AGENT%20PROMPT%20-%20Strategy%20monitor%20build.md); where it gives more detail, the prompt wins.

**Changes from revision 2**
- **Stack:** TypeScript, React, Next.js and Zod replace Python, FastAPI and Jinja.
- **Storage:** JSON files in a git-ignored `data/` folder replace the SQLite database.
- **Engine:** the strategy maths is ported to TypeScript. A parity test against the Python backtest blocks every build.
- **UI:** a SaaS-style dashboard with a dark green colour scheme, icons, tables and charts, and minimal text.
- **Tooling:** pnpm, and a single `pnpm dev` command starts everything.
- **Delivery:** the phases are now milestones M1–M8, the same as the agent prompt.

**Decided in revision 2**
- **SPAX:** the 2× ETF on SPCX, monitor-only.
- **Rules:** V3.1 is live and V3 is archived.
- **Positions** are typed in by hand.
- **Roadmap:** IBKR integration and alerts.
- **Access:** a hosted, responsive website for all devices.

---

## 1. What the app does

A private website that updates every US trading day. It gives the same overview as *Strategy v3 - execution guide.html*, as live dashboards instead of prose.

1. **SOXL gate today:** ON, RISK CUT, OFF or KILL. Each condition shows its value, its threshold and how far it is from flipping.
2. **Today's actions:**
   - the core trade, or "inside band";
   - the put to sell: strike, expiry, contracts, model credit, and which limit binds;
   - which open puts to buy back;
   - the kill-switch status.
3. **SPAX monitor:** SPAX is the 2× ETF on SPCX. It is monitor-only and gets no actions. It has a six-item qualification checklist and a verdict badge: NOT READY / WATCH / READY TO BACKTEST.

**Not in scope for v1:**
- broker connection
- order placement
- alerts

The site never places a trade; you do.

## 2. Rule set

### Live: V3.1 = V3 Balanced + amendment 1 (risk cut)

| Block | Rule |
|---|---|
| Gate (on/off) | b: SOXX SMA50 > SMA200; c: SOXL RV10/RV60 < 1.6. Evaluated at close *t*. |
| **Risk cut** | a: SOXX > SMA200. If a fails while b and c pass, the core target is ×0.5 and no new puts are sold. Open puts run as normal. |
| Core | target = min(30%, 35% / max(RV10, RV20)), capped at 10%/30% by the gap budget. Rebalance only if the holding is more than 25% away from target, measured on yesterday's equity. Trades at close *t+1*. |
| Puts | One per week, Mon–Wed, 0.20 delta, expiry = last trading day of next week. Limits: 17.5% notional per week, 35% total open, gap budget ≤ 10% of equity (core × 30% + Σ max(K − 0.7S, 0) − value). |
| Exits | Buy back at 70% of credit captured. An ITM put is closed at intrinsic value; assigned shares are never held. |
| Kill switch | Account drawdown −25% from peak. Manual review: the app shows KILL and stops suggesting new risk. It is not part of the backtest loop. |
| Pricing (model) | Black-Scholes. ATM IV = clip(1.05 × (0.5·RV20 + 0.5·RV60), 30%, 300%). Linear skew 0.5. 5% premium slippage, $0.65 commission per contract, 5 bp stock slippage. |

Backtest reference, 2018-01-01 → 16 Nov 2026, $1M start: **$4,803,823**, CAGR 19.4%, MDD −21.4%.

### Archived: V3
- Stored as `rules/archive/v3.json`. It is not selectable as the live rule set.
- It appears only as a dashed grey comparison line on the Backtest page: $4,392,157, CAGR 18.2%, MDD −23.6%.

Both rule sets live in versioned config files, so a future amendment is a new file plus a backtest, not a code change.

## 3. Underlyings

| Ticker | Role | Leverage | Reference (gate a/b) | Notes |
|---|---|---|---|---|
| SOXL | **trade** | 3× | SOXX | Splits 2015-05-20 ×4, 2021-03-02 ×15 |
| SPAX | **monitor** | 2× | SPCX | 2× daily ETF on SPCX |
| SPCX | reference | 1× | — | Listed 12 Jun 2026 at $135 |
| SPY, ^VIX, ^IRX | inputs | — | — | ^IRX = cash rate; SPY and ^VIX are joined for parity with the Python engine |

**SPAX facts to confirm in M3.** Any that cannot be confirmed are shown as "unconfirmed" and never guessed:
- launch date
- Yahoo symbol
- issuer and expense ratio
- whether listed options exist
- AUM and volume

If SPAX has no options or only thin ones, it cannot qualify for short puts.

## 4. Architecture

```
 Yahoo chart API ──► Next.js route handlers / scheduled jobs (node-cron via instrumentation.ts)
                       15:40 ET preview · 16:20 ET final · 07:00 ET catch-up · "Run now"
                                   │
                    src/engine/ (pure TypeScript, no I/O; parity-tested vs Python)
                                   │
                    data/  (JSON files, git-ignored, atomic writes, Zod-validated)
                                   │
 Phone · tablet · desktop ──HTTPS──► Next.js App Router (React, server components) ── login + TOTP
```

- **Language:** TypeScript (strict) throughout.
- **Framework:** Next.js with the App Router. API work runs in Next.js route handlers; there is no separate backend.
- **Validation:** Zod at every boundary:
  - Yahoo responses
  - config
  - run files
  - portfolio entries
  - API inputs and outputs
- **Storage:** JSON files under `data/`, which git ignores. Each write goes to a temp file and is then renamed. There is no database.
- **Engine:** a pure TypeScript module shared by the backtest replay and the live daily run. It ports `short_put_engine.py`, `risk_v3.py` and the gate swap in `riskcut_v3.py`. It needs a double-precision normal CDF to match the Python engine.
- **Scheduling:** node-cron, registered once at server start in `instrumentation.ts`. This requires a long-running Node server.
- **Tooling:** pnpm. After `pnpm install`, `pnpm dev` does three things:
  - seeds `data/` from the merged CSVs if it is empty;
  - starts the app;
  - registers the schedule.

  `pnpm build && pnpm start` does the same in production.
- **Suggested libraries:**
  - Tailwind CSS and shadcn/ui
  - lucide-react icons
  - TanStack Table
  - Recharts or ECharts
  - date-fns-tz
  - an NYSE trading-calendar helper
  - otplib and argon2/bcrypt for auth
  - Vitest and Playwright for tests

**Folder layout:**

```
WebApp/
  PLAN - Strategy monitor web app.md
  AGENT PROMPT - Strategy monitor build.md
  src/
    app/            pages (today, gate, puts, portfolio, spax, backtest, rules), api/ route handlers
    components/     cards, KPI tiles, charts, tables, state badges
    engine/         features.ts, blackscholes.ts, gate.ts, sizing.ts, puts.ts, replay.ts, metrics.ts
    data/           yahoo.ts, validate.ts, calendar.ts, store.ts (JSON I/O)
    jobs/           preview.ts, final.ts, catchup.ts, scheduler.ts
    schemas/        Zod schemas (bars, config, RunResult, portfolio)
    providers/      QuoteProvider / PositionProvider interfaces (stubs for the IBKR roadmap)
  config/           underlyings.json, rules/v3_1.json, rules/archive/v3.json
  tools/            export_fixtures.py (reads v2_engine read-only), seed.ts, auth-setup.ts
  tests/            engine/, data/, fixtures/, e2e/ (Playwright)
  data/             (git-ignored) bars/, runs/, portfolio/, backtest/
  Dockerfile, docker-compose.yml, .env.example, README.md
```

**Run files in `data/`:**
- `runs/YYYY-MM-DD_{preview|final}.json` holds one RunResult per run. It contains:
  - the gate block, core block, put block and open-put actions;
  - the account and kill-switch status;
  - the SPAX block;
  - data freshness;
  - a `working` object with the formula and inputs for every number.
- `runs/latest.json` points to the newest valid final run.
- `backtest/v3_1.json` and `backtest/v3_archived.json` are the nightly full replay: equity, drawdown, monthly and yearly returns, and trades.
- `portfolio/entries.json` holds the daily snapshots you enter. `portfolio/journal.json` records recommendation vs what you did.

## 5. Daily timing (America/New_York)

- **Preview, 15:40** (04:40 HKT in winter, 03:40 in summer):
  - uses Yahoo's live price as a provisional close;
  - gives a provisional gate, core target and put;
  - flags any condition within 1% of its threshold as "close call".
- **Final, 16:20:** official close bar, accepted only after the session has closed. It confirms or revises the result, lists what changed since the preview, and fixes tomorrow's core trade.
- **Catch-up, 07:00:** re-runs if the last final run is missing.
- **"Run now":** a button in the header.
- **Freshness:** the header shows the as-of date, a freshness dot and the run type.

## 6. UI design

**Principles:**
- **Data first, words last.** Use KPI tiles, gauges, sparklines, charts and tables. Labels are one line at most.
- **Icons on every row and action.**
- **Show working on demand.** Every number has an ⓘ popover with its formula and inputs, in place of explanatory paragraphs.

**Theme:** a SaaS-style dark green palette. This is a starting set; refine it to WCAG AA contrast.

| Token | Value |
|---|---|
| background | `#07140F` |
| surface | `#0D1F18` |
| raised | `#13291F` |
| border | `#1E3A2E` |
| text | `#E6F2EC` |
| muted | `#8FB3A3` |
| brand | `#2FBF71` |

**State colours,** kept distinct from the brand green and always paired with an icon and a label:

| State | Colour | Icon |
|---|---|---|
| ON | bright green | check |
| RISK CUT | amber | shield-half |
| OFF | slate | power-off |
| KILL | red | octagon |

**Layout:**
- **Desktop:** a collapsible icon sidebar.
- **Phone:** a bottom tab bar.
- **Header:** sticky, with the date, freshness, run type and Run now.
- **Tables** become stacked cards below 640px.
- **No horizontal scroll** at 360px; tap targets at least 44px.
- **Charts** resize and support touch tooltips.
- **Home screen:** a web-app manifest so the site can be added to a phone like an app.

**Pages:**

| Page | Content |
|---|---|
| **Today** | State hero; three condition tiles (a/b/c) with value vs threshold, distance-to-flip gauge and 60-day sparkline; action table (core / sell put / buy back, or "No action"); KPI row (equity, drawdown bar to −25%, core %, put notional %, gap-budget bar) |
| **Gate** | SOXX with SMA50/200 (1Y/5Y toggle) and shaded ON / RISK CUT / OFF bands; RV10/RV60 chart with the 1.6 line; gate episodes table |
| **Puts** | Open-puts table (strike, expiry, contracts, credit, model value, % captured bar, distance to strike, buy-back price); closed-puts table with P&L; gap-budget stacked bar |
| **Portfolio** | Quick daily entry form (numeric keypads); puts editor; journal table; consistency warning |
| **SPAX** | Six checklist tiles; SPAX/SPCX price charts with IPO and peak lines; 2× tracking chart; unlock countdown |
| **Backtest** | Equity curve (V3.1, archived V3 dashed grey, SOXL buy-and-hold); underwater chart; monthly returns heatmap (years × months plus year total); yearly table; KPI row (CAGR, MDD, Sharpe, Calmar, put win rate) |
| **Rules** | V3.1 parameter table with icons, rendered from config; collapsed "Archived: V3" section |

## 7. SPAX qualification checklist

1. **History:** SPCX has at least 200 trading days (about late Mar 2027). SPAX gets its own counter from its launch.
2. **Trend:** SPCX > SMA200 and SPCX SMA50 > SMA200, the same a/b tests as SOXX. Before day 200, show the provisional SMA50 and price vs the $135 IPO price, labelled "provisional".
3. **Vol brake:** SPAX RV10/RV60 < 1.6.
4. **Premium edge:** SPAX IV/RV ≥ 1.1 for 20+ days. IV is entered by hand each day from the broker screen; show the streak.
5. **Options tradeable:** weekly or biweekly expiries, a bid-ask spread ≤ 10% of mid, and open interest ≥ 500 near 0.20 delta. These are entered by hand.
6. **Unlocks digested:** ≈5.9% around 8 Dec 2026 and ≈47% founder pool on 12 Jun 2027. Show a countdown and SPCX's 20-day return and vol after each unlock.

**Stats:**
- SPAX and SPCX price, RV10/20/60
- drawdown from peak, return since listing
- **2× tracking:** SPAX daily return vs 2 × SPCX daily return, with the cumulative gap

## 8. Milestones (the agent stops and reports after each)

| # | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **M1** | Scaffold: Next.js + TypeScript strict + Tailwind/shadcn, pnpm one-command start, Zod schemas, seed import from the merged CSVs, theme tokens, app shell (sidebar / bottom tabs) | `pnpm install && pnpm dev` on a clean clone serves the shell with seeded bars | 1 day |
| **M2** | Engine port to TypeScript; `tools/export_fixtures.py` (Python, read-only on `v2_engine`, run with `uv`); Vitest parity tests | V3.1 = $4,803,823 and V3 = $4,392,157 within 1e-6 relative; identical trade count; per-day equity within 1e-6 | 3 days |
| **M3** | Yahoo updater, validation (partial-bar, splits, seed stitching, calendar, stale data), NYSE expiry calendar, scheduler, RunResult files, SPAX fact check | Preview / final / catch-up runs write valid JSON; data tests pass | 1.5 days |
| **M4** | Today, Gate and Puts pages | The 16 Nov 2026 final run reproduces the guide's figures; Playwright layouts pass at 360 / 768 / 1024 / 1440 px | 3 days |
| **M5** | Portfolio entry, puts editor, journal, consistency check | Entering the 16 Nov state gives the guide's "Where things stand" numbers | 1.5 days |
| **M6** | SPAX monitor | All six checks render with correct values; unknown facts shown as "unconfirmed" | 1.5 days |
| **M7** | Backtest and Rules pages | Monthly heatmap and yearly table match the Python output | 1.5 days |
| **M8** | Auth (password + TOTP, `pnpm auth:setup`), Dockerfile + compose with a persistent `data/` volume, README, VPS deploy, device test pass | Login with 2FA works; reachable from a phone on mobile data; three unattended trading days run correctly | 1.5 days |
| | **Total** | | **≈ 14.5 days** |

After launch comes **shadow mode for 2–4 weeks.** You keep following the guide by hand, and the site must agree every day before you rely on it.

**Document housekeeping** is done separately, not by the build agent:
- write *Strategy v3.1 - rule card*;
- update the execution guide to V3.1;
- move the V3 rule card and V3 guide to `Strategy/Archive/`.

## 9. Hosting

The JSON-file storage and the in-process scheduler need a **long-running Node server with a persistent disk**. Serverless platforms such as Vercel do not fit.

| Option | Cost | Pros | Cons |
|---|---|---|---|
| **Small VPS + Docker Compose + Caddy (auto HTTPS)** **(recommended)** | ~US$5–7/mo | Persistent disk for `data/`; the scheduler runs reliably; easy to add IB Gateway later for the IBKR roadmap item | You keep the OS patched (enable automatic updates) |
| Managed container platform with a persistent volume (Fly.io / Railway / Render) | ~US$5–15/mo | No server to maintain, git-push deploys | Volumes and always-on instances cost extra; IB Gateway later is awkward |
| Mac at home + Cloudflare Tunnel | free | No hosting bill | Down when the Mac sleeps, so runs can miss the close |

**Backups:** a nightly copy of `data/` off the server, with a restore tested once.

## 10. Roadmap (after v1, not scheduled)

| Item | What it adds | Depends on |
|---|---|---|
| **IBKR: quotes** | Real put chain at preview time: listed strike nearest 0.20 delta, bid/ask/mid, IV. A model-vs-market credit log (the biggest open risk is synthetic pricing: a 15% IV error ≈ 4 points of CAGR). Automatic SPAX IV and options checks. | IB Gateway on the VPS; implements `QuoteProvider` |
| **IBKR: positions** | Read-only sync of account value, shares and open puts. Manual entry stays as a fallback. | Implements `PositionProvider` |
| **Alerts** | Web push, Telegram or e-mail when: the gate changes state; an action is due; a profit-take target is hit; drawdown passes −20%; a data check fails; a job fails; a SPAX check flips. | M8 |
| What-if backtests | Change parameters in the UI and run them as a background job | M2 |
| More monitors | TQQQ, NVDL, TSLL, USD (data already in `Backtest/Data/`) | M6 (config only) |
| Core 25/30 option | Lower-drawdown sizing, after its full robustness battery | Backtest work |

## 11. Testing

- **Parity (Vitest):** the TypeScript replay equals the Python fixtures for V3.1 and archived V3. It runs on every build and blocks deployment if it fails.
- **Golden days:** hand-checked outputs from the guide, such as the 16 Nov status, the 21.7% → band → $10,280 core example, a profit-take day and an ITM expiry.
- **Edge cases:**
  - Monday or Friday holidays (expiry falls on Thursday);
  - half-days;
  - a gate that flips between preview and close;
  - all three put limits binding;
  - zero room in the gap budget;
  - a new split;
  - a missing ^IRX value;
  - too little history for SPAX or SPCX indicators.
- **Data:**
  - partial-bar rejection;
  - duplicate bars;
  - seed/Yahoo stitch mismatch above 0.5%;
  - missing sessions.
- **UI (Playwright):** screenshots at 360 / 768 / 1024 / 1440 px, with checks for no horizontal scroll and that tap targets are at least 44px.
- **Security:**
  - every page and API route requires auth, except `/api/health`;
  - login rate limiting and session expiry;
  - no secrets in the repo (`.env.example` only).
- **Before every milestone report:** `pnpm test`, `pnpm lint` and `pnpm typecheck` all clean.

## 12. Risks

| Risk | Mitigation |
|---|---|
| TypeScript port drifts from the Python backtest | Day-by-day fixture parity; double-precision normal CDF; the "initial value = credit" quirk reproduced; the build blocks on mismatch |
| Bad or partial Yahoo data | Validation, freshness stamp, action list blocked when checks fail |
| JSON file corruption or concurrent writes | Atomic temp-file-then-rename writes; Zod validation on read; nightly backup |
| Typos in hand-entered positions | Consistency check vs yesterday plus recommended trades; journal |
| Model strike or credit differs from the market | Labelled "model"; real quotes on the roadmap (IBKR) |
| Preview and close disagree | Close-call flag; the final run lists what changed |
| Public site holds financial data | Password + TOTP, HTTPS, secure cookies, no broker credentials |
| Server down at run time | Catch-up run; freshness banner; health endpoint |
| SPAX gives false confidence | Monitor-only; "ready" means backtest, not trade; options-liquidity check; "unconfirmed" chips |

## 13. Still open
1. **Hosting:** the VPS (recommended) or a managed platform?
2. **Domain:** your own domain, or the host's subdomain?
3. **SPAX options thresholds:** are spread ≤ 10% of mid and open interest ≥ 500 acceptable minimums?
