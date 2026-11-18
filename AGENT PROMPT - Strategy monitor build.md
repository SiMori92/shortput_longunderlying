# Prompt: build the Strategy Monitor web app

You are building a private web application. It monitors a set of underlyings and, after each US trading day, publishes an updated analysis of one options strategy. The strategy is a trend-gated SOXL core plus weekly short puts, rule set "V3.1". Read this whole brief before writing any code.

---

## 0. Context and source material (read these first)

| Path | What it is |
|---|---|
| `/Users/simpochiu/Documents/Invest-Short_Put_Quant/WebApp/PLAN - Strategy monitor web app.md` | The work plan (revision 3, already aligned with this brief). It defines features, pages, the SPAX checklist, milestones, testing and risks. **Follow it; if the two ever disagree, this brief wins.** |
| `/Users/simpochiu/Documents/Invest-Short_Put_Quant/Backtest/Backtest_app/v2_engine/short_put_engine.py` | Python reference: data loading, features, Black-Scholes, skew, strike solver, metrics |
| `.../v2_engine/risk_v3.py` | Python reference: the `run3` daily loop, the `C3` config, `V3_BALANCED` |
| `.../v2_engine/riskcut_v3.py` | Python reference for the **V3.1 risk-cut** variant: the gate swap with `GATE`, `MULT` and `PUTOK` columns |
| `.../v2_engine/data_merged_2026-11-16/` | Daily OHLC CSVs to the 16 Nov 2026 close: SOXL and SOXX from 2010, SPCX from 12 Jun 2026, plus SPY, ^VIX, ^IRX. Use these as seed history. |
| `/Users/simpochiu/Documents/Invest-Short_Put_Quant/Strategy/Strategy v3 - execution guide.html` | The current static guide. The app is its live, visual successor; reuse its structure and worked examples. |
| `/Users/simpochiu/Documents/Invest-Short_Put_Quant/Strategy/Strategy v3 - Risk control upgrade (2026-11-17).md` | V3 rule card (V3.1 = V3 plus amendment 1, below) |

**The Python code is the source of truth for the strategy math.**
- Read it; do not modify anything under `Backtest/` or `Strategy/`.
- Build everything inside `/Users/simpochiu/Documents/Invest-Short_Put_Quant/WebApp/`. The plan file stays where it is.

## 1. Stack and hard constraints (these override the plan's Python/FastAPI/SQLite choices)

- **TypeScript (strict), React, Next.js (App Router, latest stable), Zod.** Use Zod for every boundary:
  - Yahoo responses
  - rule and underlying config
  - run JSON files
  - portfolio entries
  - API route inputs and outputs
- **Backend:** Next.js API routes (route handlers) do all fetching and computation.
  - Each run is saved as a JSON file under `data/`. Add `data/` to `.gitignore`.
  - There is no database.
  - Writes are atomic: write a temp file, then rename.
- **Package manager: pnpm. Start with one command.**
  - On a fresh clone, after `pnpm install`, `pnpm dev` must:
    - seed `data/` from the CSVs if it is empty;
    - start the app;
    - register the daily scheduler.
  - `pnpm build && pnpm start` does the same in production.
  - Document both in `README.md`.
- **Deploy target:** a long-running Node server (Docker on a small VPS), because JSON files need a persistent disk. Do **not** design for Vercel or serverless.
- **UI:**
  - **SaaS-like dashboard with a dark green colour scheme.**
  - **Minimal text, icons everywhere** (lucide-react).
  - **More tables and dashboard graphs than prose.**
  - Fully responsive: phone, tablet and desktop.
- **Suggested libraries.** You may substitute, but justify it in the README.
  - Tailwind CSS with shadcn/ui
  - TanStack Table for tables
  - Recharts or ECharts for charts
  - date-fns-tz for timezones
  - node-cron for scheduling, registered in `instrumentation.ts`
  - `@node-rs/argon2` or `bcryptjs`, and `otplib` for auth
- **No broker integration, no order placement and no alerts in v1.** Those are roadmap items, so leave clean interfaces for them. Only stub the broker interface (`QuoteProvider`, `PositionProvider`); implement nothing.
- **Never invent market data or facts.** If something is unknown, show it as "unconfirmed" in the UI and list it in the README. SPAX facts are an example (section 6).

## 2. What the app does (summary; details in the plan)

The app answers three questions, each with a chart or table first and as few words as possible:

1. **SOXL gate today:** ON, RISK CUT, OFF or KILL. For each condition a/b/c it shows value vs threshold and the distance to flip.
2. **Today's actions:**
   - the core trade: shares, or "inside band";
   - the put to sell: strike, expiry, contracts, model credit, and which limit binds;
   - which open puts to buy back;
   - the kill-switch status.
3. **SPAX monitor:** SPAX is the 2× ETF on SPCX, and is monitor-only with no actions. It shows a six-item qualification checklist and a verdict badge: NOT READY / WATCH / READY TO BACKTEST.

The user types positions in by hand: account value, SOXL shares and open puts.

## 3. Strategy spec to port: V3.1 (parity-critical)

Port these into a pure, framework-free TypeScript module, `src/engine/`, with no I/O. The backtest replay and the live daily run must use the same functions.

**Data and features** (match `build_features` and `prep`):
- `S` = SOXL `close` and `REF` = SOXX `close`. Use the `close` column, **not** `adjclose`.
- `RF` = ^IRX close / 100. Join SOXX, SPY, ^VIX and ^IRX onto SOXL dates (left join), forward-fill, then drop rows with missing values.
- `RVn` = sample std (ddof = 1) of daily log returns over n days × √252, for n = 10, 20 and 60. `RVfast = max(RV10, RV20)`.
- `IV_ATM = clip(1.05 × (0.5·RV20 + 0.5·RV60), 0.30, 3.0)`.
- `REF_SMA50` and `REF_SMA200` are simple moving averages of SOXX. Drop rows until IV_ATM and REF_SMA200 exist.
- **Expiries:** the last trading day of each Mon–Fri week (pandas period `W-FRI`). `week_id` identifies the week.
- **Split factor:** `unadj/S` uses the SOXL forward splits 2015-05-20 ×4 and 2021-03-02 ×15. It is only used to convert the $0.65 per-contract commission: `commission / (100 × splitFactor)`.

**Option maths:**
- `bs_put` is standard Black-Scholes (intrinsic value when T ≤ 0).
- `put_delta = N(d1) − 1`.
- **Skewed IV:** `atm × (1 + 0.5 × max(−ln(K/S), 0))`.
- **Strike for target delta 0.20:** bisection on [0.3S, S], 60 iterations, using the skewed IV (copy the exact loop).
- **Normal CDF:** use a double-precision implementation (port Cody's erfc or the Cephes `ndtr`). A low-precision approximation such as Abramowitz–Stegun will break parity.
- Time T is measured in **calendar days / 365**.

**Daily loop** (port `run3` step by step, in this order):
1. **Interest on cash** over the calendar days since the previous bar: rate `r` when cash > 0, and `r + 1.5%` when negative.
2. **Execute yesterday's core target.**
   - `tgtQty = coreTgtW × lastEquity / S`.
   - Trade if (`tgtQty == 0` and you hold shares) or (`|tgtQty − qty| × S > 0.25 × coreTgtW × lastEquity`). This is the 25% band, measured against **yesterday's** equity.
   - Stock slippage is 5 bp of the traded value.
3. **Gate at today's close (V3.1).**
   - Conditions:
     - `a = REF > SMA200`
     - `b = SMA50 > SMA200`
     - `c = !(RV60 > 0 && RV10/RV60 > 1.6)`
   - State:
     - `gateOn = b && c`
     - `mult = a ? 1 : 0.5`
     - `putOk = a`
   - Archived **V3**, for comparison only: `gateOn = a && b && c`, `mult = 1`, `putOk = true`.
4. **Manage open puts.**
   - **At or after expiry:** pay intrinsic × qty. If the put is ITM, also pay `S × qty × 5bp`. Record the trade with `assigned = S < K`.
   - **Otherwise:** mark the put at the skewed-IV BS value. If `value ≤ 0.30 × credit`, buy it back at `value × 1.05 + commission`.
5. **Equity and drawdown.** `eqNow = cash + coreQty·S − Σ value·qty`. Drawdown is measured against the running peak of eqNow.
6. **New put entry.** Requirements: `gateOn && putOk`, the first entry this week, the day is Mon–Wed, and at least 2 future expiries are known.
   - `expiry` = the 2nd future expiry; solve the 0.20-delta strike K.
   - `notional = max(0, min(0.175·eq, 0.35·eq − openNotional))` and `qty = notional / K`.
   - **Gap budget:**
     - `Sg = 0.7·S`
     - `used = coreQty·S·0.30 + Σ (max(K_i − Sg, 0) − value_i)·qty_i`
     - `unit = max(K − Sg, 0)`
     - `qty = min(qty, max(0, (0.10·eq − used)/unit))`
   - `credit = mid × 0.95 − commission`. Open the put only if `credit > 0` and `qty > 0`.
   - **Quirk to reproduce exactly:** a new position's initial `value` is set to `credit`, not mid. Mark-to-market in step 7 only re-prices positions whose value is exactly 0.
7. **Mark to market and record equity.** Record equity, core weight, put notional weight, gate state and drawdown.
8. **Decide tomorrow's core target.**
   - If `!gateOn`, the target is 0.
   - Otherwise `w = min(0.30, 0.35 / max(RVfast, 1e-6)) × mult`, then `w = min(w, 0.10/0.30)`.

Quantities are fractional in the backtest. The **live** action list must round: contracts down to whole contracts, shares to whole shares. Show both the model quantity and the rounded quantity.

**Kill switch:** if drawdown ≤ −25%, the app shows KILL and suppresses new-risk suggestions. This is a manual-review rule, and it is **not** part of the backtest loop.

**Metrics:** port `metrics()` and `summarize()`:
- CAGR on 365.25-day years
- Sharpe from daily excess returns over RF/252
- Calmar
- MDD
- yearly and monthly returns

**Parity targets** (start capital 1,000,000; seed data; start 2018-01-01; end 2026-11-16):

| Rule set | Final equity | CAGR | MDD |
|---|---|---|---|
| **V3.1 (live)** | **4,803,823** | 19.4% | −21.4% |
| V3 (archived) | 4,392,157 | 18.2% | −23.6% |

**Parity process:**
- Write `tools/export_fixtures.py`. It imports the Python modules from `v2_engine` read-only and exports day-by-day JSON for both rule sets:
  - features
  - gate state
  - core target
  - equity
  - every trade
- Run it with `uv run`. Create a fresh venv with pandas, numpy and scipy; do not assume an existing one.
- For V3.1, replicate the gate swap from `riskcut_v3.py` inside the export script. Do **not** import `riskcut_v3.py`, because it runs a long robustness battery at import.
- The Vitest parity test must match within **1e-6 relative** on final equity, the exact same number of trades, and per-day equity within 1e-6. A failing parity test blocks the build.

## 4. Data layer

- **Seed** `data/bars/{SYMBOL}.json` from the merged CSVs on first start.
- **Update incrementally** from the Yahoo chart API: `query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=…&events=split`. Symbols: SOXL, SOXX, SPY, ^VIX, ^IRX, SPCX and SPAX.
  - Use a generic User-Agent.
  - Never send user data.
- **Validation** (each failure shows a banner and blocks the action list):
  - **Reject a partial bar.** Accept today's bar only after 16:15 America/New_York, or once Yahoo's meta says the regular session has ended. A partial bar was served for 17 Nov 2026 during the session.
  - **Splits:** compare Yahoo's split events with the known list. A new split stops processing.
  - **Stitching:** where seed and Yahoo overlap, closes must agree within 0.5%, otherwise stop.
  - **Missing data:** check for missing sessions against an NYSE trading calendar, including holidays and half-days. Flag stale data.
  - Flag a daily move over 40% on a reference index.
- **Expiries going forward:** future expiry dates are not in the data, so derive them from the NYSE calendar (Friday, or Thursday when Friday is a holiday).

## 5. Runs, scheduling and storage

- **Three runs per trading day** (America/New_York):
  - **Preview at 15:40.** Uses Yahoo's live quote as a provisional close. Flags any condition within 1% of its threshold as "close call".
  - **Final at 16:20.** Uses the official close and lists what changed since the preview.
  - **Catch-up at 07:00.** Re-runs if the previous final is missing.
- Add a "Run now" button: `POST /api/runs` (needs auth).
- **Layout of `data/`:**

```
data/
  bars/SOXL.json …             daily bars
  runs/2026-11-16_final.json   one file per run (Zod-validated RunResult)
  runs/latest.json             pointer / copy of the newest valid final run
  portfolio/entries.json       hand-entered snapshots (date, account value, shares, open puts)
  portfolio/journal.json       recommendation vs what was done, plus note
  backtest/v3_1.json           nightly full replay (monthly/yearly tables, equity, drawdown)
  backtest/v3_archived.json
  config/underlyings.json, rules/v3_1.json, rules/archive/v3.json
```

- A **RunResult** contains:
  - the run type and timestamp;
  - the data-freshness status;
  - the gate block: a/b/c values, thresholds, distances, state;
  - the core block: formula inputs, target, band, trade;
  - the put block: K, expiry, delta, model mid and credit, the three limits and which one binds, contracts;
  - open-put actions;
  - account and kill-switch status;
  - the SPAX monitor block;
  - a `working` object with the formula and inputs for every number.

## 6. SPAX (2× ETF on SPCX): monitor only

- **Facts to confirm before relying on them:**
  - launch date
  - the exact Yahoo symbol
  - issuer and expense ratio
  - whether listed options exist
  - AUM and volume

  If they cannot be confirmed from Yahoo data, store `"unconfirmed"` and show a warning chip. **Do not invent them.**
- **Checklist** (from the plan, section 7):
  1. **History:** SPCX has at least 200 trading days (about late Mar 2027). SPAX has its own counter.
  2. **Trend:** SPCX > SMA200 and SMA50 > SMA200. Before day 200, show the provisional SMA50 and price vs the $135 IPO price, labelled provisional.
  3. **Vol brake:** SPAX RV10/RV60 < 1.6.
  4. **Premium edge:** SPAX IV/RV ≥ 1.1 for 20+ days. IV is entered by hand each day; show the streak.
  5. **Options tradeable:** weekly or biweekly expiries, bid-ask spread ≤ 10% of mid, and open interest ≥ 500 near 0.20 delta. These are entered by hand.
  6. **Unlocks:** ≈5.9% around 8 Dec 2026 and ≈47% founder pool on 12 Jun 2027. Show a countdown and the post-unlock 20-day return and vol.
- **Stats:**
  - SPAX and SPCX price, RV10/20/60
  - drawdown from peak, return since listing
  - a **2× tracking chart:** SPAX daily return vs 2 × SPCX daily return, with the cumulative gap
- Configure underlyings in config, so more monitors (TQQQ, NVDL) can be added later without code changes.

## 7. Pages and UI

The design language is a modern SaaS dashboard. Each page is mostly cards, KPI tiles, charts and tables, with a one-line label at most. Every number has an `ⓘ` icon that opens a "working" popover (formula plus inputs), in place of explanatory paragraphs.

**Theme:**
- Dark first, deep green surfaces. A starting palette, to be refined for contrast:
  - background `#07140F`
  - surface `#0D1F18`
  - raised `#13291F`
  - border `#1E3A2E`
  - text `#E6F2EC`
  - muted `#8FB3A3`
  - brand `#2FBF71`
- **State colours must be distinct from the brand green:**
  - ON = bright green with a check icon
  - RISK CUT = amber with a shield-half icon
  - OFF = slate with a power-off icon
  - KILL = red with an octagon icon
- Each state also uses an icon and a label, so colour is never the only cue.
- All text meets WCAG AA contrast.

**Layout:**
- **Desktop:** a collapsible icon sidebar.
- **Phone:** a bottom tab bar.
- A sticky header with the as-of date, a freshness dot, the run type (Preview/Final) and a "Run now" icon.
- Tables become stacked card lists below 640px.
- No horizontal page scroll at 360px.
- Tap targets are at least 44px.
- Charts resize and support touch tooltips.
- Add a web-app manifest and icons, so the site can be added to a phone's home screen.

**Pages:**
1. **Today (home):**
   - **State hero:** ON / RISK CUT / OFF / KILL, with the date.
   - **Three condition tiles** (a, b, c): value, threshold, distance to flip as a gauge or bar, and a 60-day sparkline.
   - **Action table:** core / sell put / buy back, each with an icon and quantity, or "No action".
   - **Account KPIs:** equity, drawdown with a bar to −25%, core %, put notional %, and a gap-budget usage bar.
2. **Gate:**
   - SOXX price with SMA50 and SMA200, with a 1Y/5Y toggle and shaded background bands for ON / RISK CUT / OFF;
   - an RV10/RV60 line with the 1.6 threshold;
   - a gate episodes table (start, end, days, SOXL return).
3. **Puts:**
   - an open-puts table: strike, expiry, contracts, credit, model value, % captured as a progress bar, distance to strike, buy-back price;
   - a closed-puts table with P&L;
   - a gap-budget stacked bar (core / puts / room).
4. **Portfolio:**
   - a quick-entry form for the daily snapshot, mobile-friendly with numeric keypads;
   - a puts editor;
   - a journal table;
   - a consistency warning when entries disagree with yesterday plus the recommended trades.
5. **SPAX:**
   - the checklist as a row of six status tiles;
   - price charts for SPAX and SPCX with IPO and peak lines;
   - the 2× tracking chart;
   - an unlock countdown.
6. **Backtest:**
   - a V3.1 equity curve, with archived V3 as a dashed grey line and SOXL buy-and-hold;
   - an underwater (drawdown) chart;
   - a **monthly returns heatmap table** (years × months, plus a year total);
   - a yearly table;
   - a KPI row: CAGR, MDD, Sharpe, Calmar, put win rate.
7. **Rules:**
   - the V3.1 parameters as a compact table with icons, rendered from the rules config;
   - an "Archived: V3" section, collapsed by default.

## 8. Security (the site will be on the public internet)

- **Single-user login on every page and API route,** except `/api/health`:
  - password hash and TOTP secret come from env vars (`AUTH_PASSWORD_HASH`, `AUTH_TOTP_SECRET`, `SESSION_SECRET`);
  - httpOnly, secure, SameSite cookies;
  - login rate limiting.
- Provide `pnpm auth:setup` to generate the hash, the TOTP secret and a QR code.
- No secrets in the repo; ship a `.env.example`.

## 9. Milestones (stop and report after each)

| # | Deliverable | Acceptance |
|---|---|---|
| M1 | Repo scaffold, pnpm one-command start, Zod schemas, seed import | `pnpm dev` on a clean clone serves a placeholder dashboard with seeded bars |
| M2 | Engine port, fixture export, parity tests | Vitest parity passes for V3.1 and V3 within the tolerances in section 3 |
| M3 | Yahoo updater, validation, scheduler, RunResult files | Preview/final/catch-up runs write valid JSON; partial-bar and split tests pass |
| M4 | Today, Gate and Puts pages | The 16 Nov 2026 final run reproduces the guide's figures; works at 360/768/1024/1440px |
| M5 | Portfolio entry and journal | Entering the 16 Nov state gives the guide's "Where things stand" numbers |
| M6 | SPAX monitor | All six checks render with correct values; unknown facts shown as unconfirmed |
| M7 | Backtest and Rules pages | Monthly heatmap and yearly table match the Python output |
| M8 | Auth, Dockerfile, README | Login + TOTP works; `docker compose up` runs with a persistent `data/` volume |

**Testing:**
- Vitest for the engine and data rules, including golden days and edge cases from the plan (section 11).
- Playwright screenshots at four widths for the main pages.
- `pnpm test`, `pnpm lint` and `pnpm typecheck` must be clean before each milestone report.

## 10. Rules of engagement

- Follow the plan's scope and the non-goals: no broker, no orders, no alerts.
- If the Python reference is ambiguous, read the code. If it is still unclear, stop and ask; do not guess.
- Keep strategy constants in the rules config, not scattered through the code.
- Label every model-derived option number "model". They are synthetic Black-Scholes values, not market quotes.
- At each milestone, report:
  - what was built;
  - the test results, with real output;
  - any deviation from this brief;
  - open questions.
