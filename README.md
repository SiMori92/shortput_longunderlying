# Strategy Monitor

Private SOXL V3.1 dashboard, built for a single long-running Node server with a persistent disk. **M1–M8 code is implemented. Password + TOTP protects dashboard pages and APIs. Live recommendations remain blocked by the data-review findings below.** Docker runtime, VPS/phone access and the three-trading-day unattended trial require external validation; see M8 below. Both host start commands bind to loopback; deploy behind HTTPS.

## Run

Use Node 24 LTS (Node 26 also supported) and pnpm 10.20.0. From `WebApp/`:

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. On first start, `/login` shows setup required and private data stays inaccessible. In another terminal run `pnpm auth:setup`, enroll the authenticator, and restart `pnpm dev`. No separate seed command or scheduler process is needed. Startup awaits Zod-validated seed import before accepting requests, then registers three America/New_York cron schedules. The jobs now perform calendar-gated Yahoo updates and write validated run files. Startup registers jobs but does not force an immediate market request.

Production build and local production start:

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm start
```

Startup also seeds an empty disk in production. The build itself does not seed data or start jobs. `pnpm build` runs the test suite before Next.js compilation; the mandatory Python/TypeScript parity gate is part of this suite. M8 adds authentication and a Docker Compose deployment path. This is not a serverless/Vercel application.

Optional `DATA_DIR` selects the writable data directory (default `./data`). Use one Node process and a persistent local filesystem; do not run multiple replicas or simultaneous seed commands against one directory. `pnpm seed` is available for diagnostics but is not required for startup. All JSON writes validate first, write a private unique temporary file in the destination directory, then rename it atomically. Existing valid data is retained; malformed existing files abort startup and are never silently replaced. Atomic replacement prevents partial reads; portfolio mutations additionally use an exclusive process lock and a combined entries/journal SHA-256 revision to reject stale-tab overwrites (409). A crashed process can leave `data/portfolio/.write.lock`; inspect the server process before manually removing that lock. Never remove an active writer’s lock.

## Source and storage

`seed/bars/*.csv` are byte-for-byte copies of the six supplied CSVs from `../Backtest/Backtest_app/v2_engine/data_merged_2026-11-16/`. They are bundled so a clone containing only `WebApp/` can start. `seed/manifest.json` records SHA-256 provenance. The source folders and original plan/prompt are not modified.

- `src/schemas/`: bars, rules, underlyings, Yahoo chart payloads, RunResult, portfolio, journal and API boundaries.
- `src/data/`: atomic JSON storage and validated CSV seeding. `close` and `adjclose` remain distinct; only the raw `close` is displayed.
- `config/`: checked-in V3.1 live rules, archived V3, and configurable instrument roles. Startup copies defaults into `data/config/` only when missing.
- `src/jobs/`: once-per-process scheduler registration, including development reload protection.
- `src/providers/`: interface stubs only. No broker integration, orders or alerts.
- `data/` (ignored): seeded bars/config plus empty portfolio snapshots and journal. No fake run or backtest files are written.

Schedules: preview **15:40**, final **16:20**, catch-up **07:00**, all America/New_York. Jobs skip NYSE holidays, understand half-days, and catch up only when the previous session lacks a valid final. Final remains at 16:20 even on half-days, per the brief.

## Checks

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm exec playwright install chromium --no-shell
pnpm test:e2e
```

Vitest checks CSV boundaries, raw closes, duplicates, invalid dates, full seed import, restart preservation and failed-write behavior. Playwright uses bundled Chromium (new headless mode), isolates its seed files in ignored `.e2e-data/`, and starts its own loopback dev server on port 3100 and tests 360/768/1024/1440px layouts, mobile/desktop navigation, disabled actions, working popovers, health and no page overflow. Screenshots are written under `test-results/`. Engine tests also cover full Python parity, Cephes/SciPy numerical fixtures, golden guide days, gate boundaries, delayed core execution, interest, put limits, profit exits and assignment costs.

## UI and dependency choices

Next.js **16.4.6** was the npm `latest` stable at scaffold time; React **19.3.1**. TypeScript strict mode also enables unchecked-index protection. Zod validates file boundaries and the health response. Tailwind 4, semantic CSS tokens and lucide-react implement the deep-green shell, collapsible sidebar, mobile tabs, stacked mobile inventory, keyboard/touch-accessible working disclosures and manifest icons.

Native HTML tables and formula disclosures keep read-only dashboard rows accessible without shadcn/TanStack Table. Recharts now supplies interactive charting; see the M4 section for details. Papa Parse handles quoted CSV fields and error reporting. node-cron follows the requested scheduler stack; native Intl supplies ET time conversion. M8 uses bcryptjs, otplib and qrcode for password hashing, TOTP and local enrollment.

## Unconfirmed and pending

Checked-in SPAX facts start as `"unconfirmed"`. There is no SPAX seed CSV. The live Yahoo check confirmed the SPAX symbol (ETF name explicitly identifies 2× SPCX) and dated daily volume, saved separately under `data/facts/SPAX.json`. Launch date, legal issuer, expense ratio, listed options and AUM remain unconfirmed. `firstTradeDate` alone is not treated as proof of launch. Account state is unknown until manually entered. SOXL, SOXX, SPY, ^VIX and ^IRX seed history ends on 16 Nov 2026. **The supplied SPCX.csv actually ends on 30 Oct 2026 (98 bars), despite the brief describing the folder as history through 16 Nov.** The UI preserves this date; M3 recovered SPCX through 17 Nov using validated Yahoo updates in the local data directory. A seed badge is not a live freshness certification.

M5–M8 code is implemented, including password/TOTP login, persistent login limits and Docker packaging. Actual Docker/VPS/mobile-network validation remains pending. `.env.example` contains placeholders; no secrets. The guide is archived V3 evidence; its prose and account figures cannot be copied blindly into the V3.1 live view. The Python engine and explicit brief prevail, including its split factors, exact gate behavior and initial option-value quirk.

## M2 engine and Python parity

`src/engine/` is pure TypeScript: no filesystem, network or Next.js dependency. `stepDay` is the shared daily calculation for replay and future live runs; callers supply validated features, rules, state and an expiry calendar. Historical replay uses observed last trading bars per W-FRI week, including the reference's final-bar truncation. Future expiry generation is now provided by the M3 NYSE calendar.

The raw CSV pipeline matches Python features, daily equity/cash/targets/gates/positions, all closed puts, summary metrics and monthly/yearly returns for 2018-01-01 through 2026-11-16, starting at $1M. Both rules close 277 puts. V3.1 ends at **$4,803,823.027785802**, archived V3 at **$4,392,157.223635084**. Maximum daily absolute equity errors are **8.39e-9** and **3.26e-9** dollars respectively (rounded upward); the required tolerance is 1e-6 dollars. Final relative tolerance is 1e-6. Every build executes parity first; failed parity prevents Next.js compilation.

The normal CDF uses double-precision Cephes coefficients, tested against SciPy including far tails. Attribution and license are in `THIRD_PARTY_NOTICES.md`. Model option prices remain synthetic Black-Scholes values. Rounding helpers expose whole shares and whole contracts separately from fractional replay quantities; M4 renders these model and rounded live quantities from valid daily runs.

To regenerate independent golden fixtures, install `uv`, retain the sibling original `Backtest/Backtest_app/v2_engine/` directory, then run:

```sh
pnpm fixtures:export
```

This deletes/recreates only ignored `WebApp/.venv-fixtures/`, installs Python 3.13 with pandas 2.3.3, NumPy 2.3.5 and SciPy 1.16.3, then runs `tools/export_fixtures.py` via `uv run`. Reference files are read only; bytecode writes are disabled. The exporter imports `short_put_engine.py` and `risk_v3.py`, applies the exact V3.1 gate swap locally, and never imports the robustness battery in `riskcut_v3.py`. It asserts its instrumented archived loop equals the unmodified reference. Source and input SHA-256 hashes are saved in `tests/fixtures/provenance.json`; tests verify bundled CSVs against those hashes. Committed fixtures let ordinary installs, tests and builds run without Python or sibling source folders.

Reference details preserved: post-feature-drop gate SMA warm-up in V3.1, sample RV, split-adjusted commission, calendar-day interest, yesterday-equity band, consumed blocked entry week, initial put value equal to credit, and exact-zero-only extra marking. Kill is a separate live manual-review policy and does not alter replay.

One explicit brief override: archived `a` uses strict `REF > SMA200` even when previously ON. The original Python loop retains ON at exact equality (`>=`). No seed row hits that boundary, so parity is unchanged; a unit test locks the brief's strict comparison. The guide's core trade on 22 Oct finishes near 32% weight although the target is 30%, because quantity uses yesterday's equity. This is preserved, not normalized to today's equity.

M2 evidence: `reports/M2.md`. M3 evidence and remaining data-review findings: `reports/M3.md`.

## M3 data and daily runs

`src/market/` owns Yahoo requests, NYSE sessions, future weekly expiries and validation. Requests send only the ticker, daily interval, split event request and a time range, with a generic User-Agent. Updates overlap the stored tail by 14 calendar days; first-time symbols request full history. HTTP 429/5xx and transport failures receive at most two retries. Requests time out after 12 seconds; only two symbols fetch concurrently. Yahoo response schemas, result identity, timezone, array lengths, OHLCV and date ordering are checked. Valid overlap closes are retained byte-for-value rather than revised silently.

Validation blocks recommendations on any configured symbol failure: partial final bar, unreviewed split/factor, overlap discrepancy above 0.5%, missing NYSE sessions, stale last date, or a >40% daily move on SOXX/SPY or another configured reference. Missing history is checked from the first actual bar. RF gaps are not silently fabricated, although the parity engine preserves its reference forward-fill behavior. Cboe index bars can also exist on NYSE holidays; those extra reference observations are retained and left-joined by the engine. Their midnight-UTC daily timestamps retain the UTC date label; ETF bars normally carry session-open timestamps.

Today's completed bar is accepted only after 16:15 ET or when the response's same-day regular session metadata has ended. Preview takes Yahoo's fresh `regularMarketPrice` (quote timestamp at most 30 minutes old) as an in-memory provisional close. It never writes that provisional bar to `data/bars/`, never updates `latest.json`, and flags gate values within 1% of their thresholds. Final records changed gate values/state and model recommendations since preview.

The NYSE calendar is bounded to **2010–2028**. Standard holiday rules, exceptional Sandy/Bush/Carter closures, Juneteenth from 2022, and 13:00 early closes are implemented. 2026–2028 dates and early closes were checked against the exchange publication: https://www.nyse.com/markets/hours-calendars . Saturday New Year's Day has no Friday observation. Expiry is the last NYSE session in each Friday week. Dates after 2028 fail closed until the calendar coverage is reviewed and extended. Native `Intl` supplies IANA-zone/DST conversion, so a timezone dependency was unnecessary.

For operator diagnostics (stop the web server before using this separate writer):

```sh
pnpm run:now final
pnpm run:now final 2026-11-16
pnpm run:now preview
pnpm run:now catchup
```

`preview` requires today's NYSE session. An explicit final date must be a past/current NYSE session; an in-session current-day final is recorded as blocked. Without a date, final targets the latest completed session. Catch-up targets the previous session. The CLI seeds automatically and writes the same files as the server jobs. Run only **one writer process** per data directory; do not run this CLI concurrently with the server or another CLI. The server protects manual/scheduled triggers with a shared in-process lock, in addition to node-cron's per-job overlap guard.

Storage additions:

- `data/config/known-splits.json`: reviewed split dates/factors; seeded with the two supplied SOXL events. It does not silently approve newly observed events.
- `data/updates/latest.json`: per-symbol update status, expected/actual dates and issues.
- `data/runs/{date}_preview.json`, `{date}_final.json`, `{date}_catchup.json`: validated run documents.
- `data/runs/{date}_{type}.failed.json`: blocked final/catch-up attempts; prior successful finals are retained.
- `data/runs/last-attempt.json`: latest attempt, including failures, for the validation banner.
- `data/runs/latest.json`: newest valid completed final/catch-up only. Older manual reruns cannot roll it back.
- `data/backtest/v3_1.json` and `v3_archived.json`: full replay and monthly/yearly tables refreshed after a valid completed run. A replay failure prevents final promotion; catch-up retries after repair. Older manual reruns do not roll back nightly replay.
- `data/facts/SPAX.json`: dated Yahoo-confirmed symbol/volume plus explicitly unconfirmed remaining facts. This does not overwrite checked-in config.

Run JSON includes gate distances and close calls, next-close core estimates, model put inputs/limits/quantities, open-put actions, account/kill status, full SPAX monitor results (older files may retain placeholders), preview differences and numeric working entries. Put-limit quantities are in share units; model/rounded contracts are separately stored. No current manual snapshot means account/core/put suggestions are null and actions remain blocked. Entered NAV is never replaced with backtest equity. Drawdown uses the peak of entered snapshots and is explicitly labelled with that basis. A core action at today's price is only a **next-close estimate**; the execution-price quantity must be recomputed at the next close. A prior recorded put opened during the current week consumes that week's entry even if it is no longer open. Position/journal consistency handling is implemented in M5.

`GET/POST /api/runs` require a signed, unexpired owner session with TOTP completion. POST additionally requires same-origin JSON, a strict input schema and a maximum 2KB body. Missing/invalid auth returns 401, including when SESSION_SECRET is absent; there is no temporary bypass. The Run now button is wired to this API and displays the auth response. Password/TOTP login issues the session cookie. Pages require the same session; login, required static assets and health are public. The health endpoint intentionally reports M8 and `strategyReady:false`; this is not an auth or production-readiness claim.

### Live findings on 18 Nov 2026

A real catch-up for **17 Nov 2026** wrote a valid blocked RunResult. It recovered SPCX from 98 seed bars to **110 bars through 17 Nov**, loaded **109 SPAX bars through 17 Nov**, and extended SOXL/SPY/VIX. It refused to promote a valid final because:

1. Yahoo reports a **SOXX 3-for-1 split dated 5 Nov 2026**, absent from the reviewed split list. SOXX history was retained unchanged. This event needs source/seed review before adding it to the known list; the updater never self-approves a split.
2. Seed **^IRX lacks 11 Oct 2010 and 11 Nov 2016**, both NYSE sessions. Targeted Yahoo requests for those dates returned no observations. The stricter live validation blocks them; the reference backtest's forward-fill remains unchanged. A verified replacement or an explicit change to the missing-RF policy is needed. No rate was invented.
3. No current account snapshot exists. Account actions stay unconfirmed until a validated snapshot is supplied through the authenticated M5 API; sign in through M8 login to enter it.

The first two findings must be resolved before a live actionable final can be accepted. Healthy preview/final/catch-up and replay persistence are tested with deterministic provider responses; the real market response is deliberately retained as blocked. SPAX checklist calculations and manual option observations are implemented in M6.

## M4 dashboards

Today, Gate and Puts are implemented. Today reads the latest Zod-valid run attempt and only exposes account actions when the run is fresh, unblocked and has entered account data. A blocked market gate reads **UNCONFIRMED**; stored condition values remain visible with an unverified label and their own history date. Missing account values remain unconfirmed. Core estimates show the next-close timing, model/whole quantities and band; put estimates expose model strike, expiry, delta, credit and all three sizing limits. KILL suppresses new risk through the existing run analysis and is shown as a manual-review state.

Gate uses the shared engine's post-warm-up SMA series, a one/five-year chart selector, state bands, volatility brake and consecutive gate episodes. Episode return is last/first SOXL close minus one within the episode; it excludes the first session's overnight return. History stops at the earliest last date among the five required input files, so an unupdated reference cannot silently become a newer historical observation. This view is stored-history model context, not a fresh market certification.

Puts defaults to **Entered account**. Its separate **V3.1 model** and **Archived V3** books expose historical fractional positions and model closed trades. The date selector chooses a day from a full stored-horizon replay; truncating the replay's expiry horizon would suppress the final two weeks of put entries and is explicitly regression-tested. Initial-credit marks are retained exactly on replay entry days. Every synthetic option price is labelled model and expressed per share. No real closed fills or realized P&L are inferred from an absent snapshot or from removed positions. Current blockers and the missing current snapshot therefore leave the real account book unconfirmed.

Charts use Recharts 3.11 with responsive SVG, keyboard support and click/tap tooltips. The other library choices remain deliberately small: native semantic tables replace TanStack Table because M4 needs read-only rows and a disclosure for earlier records, without sorting, filtering or row selection. Phone tables become stacked cards. Formula disclosures support Escape/outside dismissal and clamp to the viewport. The existing CSS tokens replace a shadcn component installation for these specific cards/tables/disclosures.

Development persistent Turbopack caching is disabled in `next.config.ts`: Next 16.4.6 repeatedly reloaded pages after a cached restart during this milestone. Clean compilation fixed the issue; disabling that optional dev cache keeps repeat starts reliable. This trades startup speed for predictable local development and does not change production compilation or strategy math.

Run responsive checks with `pnpm test:e2e`. After `pnpm build`, use `E2E_PRODUCTION=1 pnpm test:e2e` to run the same suite against `pnpm start`. Both use the isolated ignored `.e2e-data/` disk. They never modify live `data/`. The tests exercise all three pages at 360/768/1024/1440px, guide figures, model date selection, blocked actions, protected Run now, navigation sizes, phone taps and working-popover bounds. M4 evidence is in `reports/M4.md`.

## M5 portfolio and journal

`/portfolio` provides dated account snapshots (net liquidation value, whole SOXL shares), an editor for whole SOXL put contracts, history selection, and an append-only execution journal. Entry credit is net cash received per option share, after entry fees; a contract covers 100 shares. All portfolio quantities, dates and file/API boundaries are Zod-validated. Negative credits, fractional contracts/shares, duplicate put IDs and puts opened after the snapshot are rejected. Weekend/holiday snapshot dates and future dates are rejected by the server. Expired puts left in a snapshot are flagged for review rather than silently settled.

`GET /api/portfolio` returns validated entries, journal and revision. `PUT /api/portfolio` accepts either `{ operation: "snapshot", revision, entry }` or `{ operation: "journal", revision, date, done, note }`. Both require the existing signed, unexpired owner/TOTP session. Writes also require same-origin JSON and a body under 64KB. No local-development authentication bypass was added. The page requires login and enables saving for a valid owner/TOTP session. Browser tests use a test-only server secret and signed test sessions against `.e2e-data/`, never real account files. M8 uses the configured `APP_ORIGIN` for same-origin checks behind TLS; client-supplied forwarded headers never determine the trusted origin.

Saving an existing date replaces that snapshot; other dates remain independent. Editing a snapshot makes any old recommendation whose current positions, entered peak or entry-week history depends on it unavailable in Today and the authenticated run API until a fresh run is generated. The complete entered snapshot history through the run date is recorded as the account basis in each new run's `working.account.snapshot`. Old runs without a basis cannot be assumed current. Saving does not change stored run files, market validation, or automatically fetch Yahoo. Use Run now after entering the relevant close once authenticated.

Consistency warnings compare the prior consecutive NYSE snapshot and its valid final share estimate; they flag share differences, changed/new/removed puts, expired positions and missing intervening snapshots. Proposed put fills still require manual confirmation. These warnings do not invent execution prices or cash P&L. The journal captures the exact stored final's ID and text on the server only when its date and account basis agree; otherwise the recommendation is `unconfirmed`. A missing snapshot prevents a journal entry. Removing a put is not a recorded exit fill and does not establish realized P&L.

Entered NAV is never reconstructed from replay equity or reduced a second time by model option liabilities. Drawdown uses only entered NAV snapshots through the selected date, without cash-flow adjustment: with one snapshot, drawdown starts at zero and an earlier peak remains unconfirmed. Exposure and gap displays use matching-date stored closes and the shared engine's model valuations, with an explicit unverified-history notice. The source guide's 16 November 2026 state is archived V3: core 0%, no puts, current drawdown −21.2482993431% (distinct from the replay's maximum drawdown). A synthetic test snapshot pair reproduces that drawdown and OFF state; no such positions or NAV were inserted into the real account.

M5 verification and screenshots are recorded in [reports/M5.md](reports/M5.md). Portfolio editing uses existing React form state and Zod; no additional form or persistence dependency was needed. M6 SPAX is implemented below; M7 backtest/rules is implemented below; M8 authentication and deployment packaging are implemented below; external deployment validation remains outstanding.

## M6 SPAX monitor

`/spax` now renders the six qualification checks, dated instrument evidence, raw-close price/peak/SMA charts, daily leveraged tracking and its cumulative percentage-point gap, unlock windows, and manual IV/option observations. The monitor has no trade actions. Calculations run on the server using the same sample-volatility helpers as the engine. Existing runs remain readable; newly generated runs include the full validated monitor plus its numeric workings. `data/monitors/latest.json` holds the last generated monitor set; the page recomputes from saved bars/manual observations, so a new observation is immediately visible while older run files remain historical snapshots.

Parameters live in `data/config/monitors.json` (initialized from `config/monitors.json`), alongside `data/config/underlyings.json`. Adding another monitor requires registry rows for the ETF and reference, monitor parameters including provider identity terms, and reviewed known-split entries where applicable. No page or calculation code needs changing. The existing NYSE calendar is deliberately bounded through 2028; unlock dates outside it fail validation until the calendar is reviewed.

Manual input is saved through authenticated `GET/PUT /api/monitors` to `data/monitors/observations.json`. One record per symbol/session is replaced atomically, protected by a revision hash and exclusive process lock. Inputs include IV in percentage units, cadence, bid, ask, OI, signed put delta, quoted expiry, and source/screen note. Missing fields stay unknown; old observations are never forward-filled. M8 login issues the owner/TOTP session; the protected page enables save controls only with a valid session. Browser tests use a test-only signed session and isolated `.e2e-data`; they do not bypass production auth or populate real observations.

Explicit interpretations where the brief leaves a choice:

- Premium edge uses manual annual IV divided by **RV20**, with 20 consecutive NYSE observations at or above 1.1. A missing day breaks the streak. Zero RV is unconfirmed.
- Near 0.20 delta means absolute put delta **0.20 ± 0.05**, configurable. Quotes must be from the current analysis session with a future session expiry. Zero mid fails the spread check; the 10% boundary is inclusive. Options cadence is manually attested, not inferred from one quote.
- Unlock dates and fractions are approximate inputs from the brief, not verified corporate actions. Enter a sourced actual date in monitor config before that event can pass. “Digested” requires 20 complete observed post-event sessions for every configured event, using the prior-session baseline; return and sample log-volatility are shown without inventing an acceptance threshold. Before confirmation, any completed scheduled-date window is labelled a scenario.
- READY TO BACKTEST requires all six checks, final validated history for both instruments, confirmed ETF identity, and all seven fact fields. Failing history/data/identity is NOT READY; otherwise incomplete qualification is WATCH. READY grants research eligibility only.
- Return since listing is displayed as **since stored start** while the launch date is unconfirmed. Tracking uses adjacent common NYSE closes and daily leverage compounding, with the last contiguous segment after a gap. These are price returns, not distribution-adjusted total returns. Reference IPO $135 remains explicitly provisional user-supplied context.

Current cached evidence (17 Nov 2026 close; provider check on 18 Nov): SPAX 109 stored sessions; SPCX 110; SPAX RV10/RV60 approximately 1.400854. The projected 200th SPCX session is **31 Mar 2027**, assuming complete future observations. Verdict: **NOT READY**. Exact Yahoo symbol and dated daily volume are confirmed in the cache. Launch date, legal issuer, expense ratio, listed options and AUM remain **unconfirmed**. No real IV/option observations have been entered. No additional external fact confirmation was performed in M6.

The bundled SPCX seed actually has 98 bars through **30 Oct 2026**, despite its source folder's 16 Nov label; the existing updater recovers the missing sessions. A fresh install therefore correctly shows stale seed history and no SPAX chart until a validated Yahoo update succeeds. M6 preserves the SOXX split/^IRX blockers documented above and does not alter strategy math or source CSVs.

M6 reuses React form state, Zod, existing CSS components and Recharts, with no new packages. See `reports/M6.md` for unit/API/parity checks, dev/production browser checks, four-width screenshots and the independent pandas/numpy seed calculation. Browser screenshots use clearly identified synthetic data confined to `.e2e-data`; real cache values are recorded separately. M7 is implemented below; M8 authentication and packaging are implemented in the final section.

## M7 Backtest and Rules

`/backtest` displays model V3.1 equity, archived V3 as a dashed grey comparison, and SOXL raw-price buy-and-hold normalized to the same initial capital. Equity supports log/linear scales (default log, to keep the strategy curves visible beside leveraged ETF swings). Its underwater chart calculates each series' own running-peak drawdown. KPI tiles show CAGR, MDD, Sharpe, Calmar and closed-model-put win rate. Monthly heatmap cells, year totals and yearly strategy/benchmark tables expose period baseline dates/equity via working disclosures. Absent months are **not zero**; final periods end at the last available session and are not annualized.

The source is a complete matching pair of Zod-validated `data/backtest/v3_1.json` / `v3_archived.json` when present. The loader rejects corrupted files, inconsistent period returns or recomputable metrics, duplicate/out-of-order days and mismatched windows/capital. An incomplete pair is an unavailable state; it never silently switches to seed results. A benchmark with missing matching sessions stays unconfirmed instead of bridging gaps.

When **both** nightly files are absent, the server runs the **same pure replay engine** over bundled original seed CSVs, with the existing comparison window (2018-01-01 through the common seed end, $1M capital). This fallback performs no writes and makes no Yahoo call. It is labelled **Seed-history replay** and never represented as a validated live final. Seed features are built independently for each current rule config. The replay preserves fractional quantities, model option marks, commissions and slippage, and excludes the manual live KILL overlay. SOXL buy-and-hold excludes fees and distributions. Stored nightly results do not contain a rule-config fingerprint; the page explicitly warns that current Rules settings do not certify an older result's settings. Historical RF inputs are not stored in nightly files; the Sharpe working marks that missing input explicitly rather than reconstructing it from a possibly different current cache.

`/rules` renders every validated rule-config field with group icons and workings. The live file is `data/config/rules/v3_1.json`; archived `data/config/rules/archive/v3.json` is collapsed by default. The displayed premium-capture threshold is the configured 70%, with working showing the complementary 30% model buyback value. Commission split factors and the live-only kill rule are explicit. This page is read-only.

M7 uses the existing CSS/Recharts/Zod stack; no new dependencies or engine changes. On narrow screens, heatmap years become month-card grids and regular tables become stacked rows. `reports/M7.md` records Python fixture comparisons, complete dev/production browser tests and screenshots at 360/768/1024/1440px. Existing live-data blockers remain. M8 adds authentication and deployment packaging below; direct host starts stay bound to loopback.


## M8 — authentication and deployment

`pnpm install` then `pnpm dev` still seeds an empty `data/` and registers the scheduler in one command. Without credentials it serves a locked login page. Authentication setup is a one-time operator task, not a second running service:

```sh
pnpm auth:setup
```

Run this in an interactive local terminal. Password and confirmation input are hidden; use 14+ characters and at most 72 UTF-8 bytes (bcrypt's input limit). Enter the exact browser origin, without a trailing slash: `http://127.0.0.1:3000` locally or `https://your-domain` on the VPS. The command creates a private `.auth-setup/totp.png` QR, requires a real authenticator code to confirm enrollment, then exclusively creates `.env.local` with permissions 0600. It never prints passwords or secrets. Open the QR locally, scan it, and delete the QR after securing an encrypted backup. `.env.local` and `.auth-setup/` are ignored by Git and Docker. Existing files are never overwritten. If setup is interrupted before saving, delete the abandoned QR before retrying.

Restart after setup or changes to environment variables. Production host operation is:

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm start
```

A clean build needs no auth secrets. Production startup, like development, seeds an empty disk and registers the three ET schedules. `APP_ORIGIN` must match the URL used by the browser. `Secure`, `HttpOnly`, host-only `__Host-` cookies use `SameSite=Strict`, `/` scope and a 12-hour absolute expiry. Local loopback works with tested Chromium; use HTTPS for any remote browser. Do not disable Secure to work around plain HTTP on a LAN IP.

Each protected page checks the session before reading private data; the dashboard layout checks again. Next 16 Proxy rejects unsigned page/RSC requests and APIs, including unknown API paths. API handlers also check sessions independently. Public exceptions are `/login`, `/api/auth/login`, `/api/health`, the manifest/icons and Next's static framework assets. Login is a same-origin JSON POST; all other mutation APIs require an owner session and same origin. `APP_ORIGIN` is operator-controlled; forwarded headers do not supply the trusted origin. Login validates the streamed body under 2KB with Zod. bcrypt uses cost 12 on setup, TOTP SHA-1/6 digits/30-second steps allows one adjacent step for clock skew, and successful steps cannot be reused. Keep server/authenticator clocks synchronized.

The single-owner global limit permits five verification attempts per 15 minutes, including successes. It survives restart in `data/auth/login.json`; forged IP headers cannot bypass it. A global limit can temporarily lock out the owner under deliberate abuse; this is a documented single-user tradeoff. An exclusive `data/auth/.login.lock` rejects overlapping verification. Corrupt auth state fails closed. After a crash, stop the sole server and inspect the lock before removing it. Keep the rate/replay state when restoring data. Sign out clears the browser cookie. Sessions are stateless: a copied cookie remains valid until expiry; rotate `SESSION_SECRET` and restart to revoke all sessions. Password/TOTP rotation should also rotate the session secret. There is no password-reset endpoint; recover via server access, encrypted backup or a new local setup. Never reset live credentials through chat or source control.

### Docker Compose

Docker must be installed with the Compose plugin on the deployment host. Run setup first; `compose.yaml` reads `.env.local` only at runtime (single quotes preserve bcrypt `$` characters). The build context excludes all credentials, account data, run files and reports. Next route tracing excludes runtime data and enrollment artifacts. A final packaging step also removes data/environment files from standalone output because instrumentation tracing and Next environment copying can include them separately. The Docker image uses Node 24, runs as the unprivileged `node` user, and starts the standalone Node server. Its build executes the mandatory parity suite.

```sh
pnpm auth:setup
docker compose up --build -d
docker compose logs --tail=100 app
curl --fail http://127.0.0.1:3000/api/health
```

The default publishes only `127.0.0.1:3000`. `strategy_data` is a named persistent volume mounted at `/app/data`; startup seeds the empty volume. `docker compose down` preserves it. **`docker compose down -v` deletes the data and must not be used for routine maintenance.** Recreate the app container after secret changes; `docker compose restart` does not reload environment values. Run one replica only. Health means the server responds; `strategyReady:false` deliberately remains independent of HTTP health.

For a public VPS, point your domain's DNS at the server, allow ports 80/443, use that HTTPS origin in setup, and put `MONITOR_HOST=your-domain` in a separate `.env` file (domain only). The optional Caddy profile provides TLS and HSTS:

```sh
docker compose --profile https up --build -d
```

Caddy persists certificates in its own volumes and forwards to `app:3000`. The app does not trust public proxy headers for origin checks. Keep the direct app port on loopback and keep the VPS clock synchronized. An existing HTTPS reverse proxy can be used instead. This is a long-running server with a local persistent filesystem; do not deploy to Vercel/serverless or scale to multiple replicas.

Back up `.env.local` separately in encrypted storage. For a consistent data backup, stop `app` briefly and archive the named volume; for example run `docker compose stop app`, then use `docker compose run --rm --no-deps --entrypoint tar app czf - -C /app/data . > strategy-data.tgz`, then `docker compose start app`. Protect that archive: it includes account records and auth replay state. Test restores on a separate isolated volume. Preserve ownership (UID/GID 1000 in the image). Rotate the session secret after a recovery involving potentially exposed credentials.

### M8 verification and remaining acceptance

See `reports/M8.md` and `reports/m8-*.log` for actual test output. Unit/API coverage includes both factors, code replay, rate persistence, corrupt state, lock contention, expiry/signature/rotation, oversized input, CSRF, Secure cookie flags and logout. Browser tests exercise real enrollment-compatible TOTP login, browser cookie storage, logout, protected page/RSC/API access, a spoofed IP limit attempt, and dashboard regressions/screenshots at 360/768/1024/1440px. Test credentials and synthetic monitor/account records are confined to temporary directories or `.e2e-data`; no owner credentials or real positions were created.

This environment has no Docker executable. Docker image build, Compose startup/restart with a persistent volume, VPS deployment, real-phone/mobile-data access and three unattended US trading days have **not** been verified. These require a Docker host, the owner's enrolled credentials/domain, and elapsed trading sessions. Standalone Node startup/restart checks are useful local evidence but do not substitute for those acceptance checks. No remote deployment is claimed.

Known market blockers are unchanged: the unreviewed SOXX split, two missing historical IRX sessions and the missing real account snapshot. Authentication does not override blocked recommendations or make SPAX qualified. No broker integration, orders or alerts were added.

## Railway — Git auto-deploy

This app is published at the root of [SiMori92/shortput_longunderlying](https://github.com/SiMori92/shortput_longunderlying), branch `main`. Use Railway Root Directory `/` and Config File `/railway.json`. Follow [the step-by-step Railway setup](deploy/RAILWAY.md).

Use the checked-in `Dockerfile` and `railway.json`. Do not override the start command with `pnpm start`: that command intentionally binds host installations to loopback. The Docker command runs standalone `server.js` on `0.0.0.0` and honors Railway's runtime `PORT`. The health check also follows `PORT`.

Choose the repository layout before connecting it:

| Git repository layout | Railway Root Directory | Railway Config File |
|---|---|---|
| Repository contains the contents of `WebApp/` at its root | `/` | `/railway.json` |
| Repository contains `WebApp/` as a subdirectory | `/WebApp` | `/WebApp/railway.json` |

The config-file path is relative to the repository root and does not automatically follow Root Directory. This app is self-contained: bundled seed CSVs and exported parity fixtures are required; the sibling `Backtest/` and `Strategy/` folders are not required to deploy.

Before enabling the first automatic deployment, attach a Railway volume to the app service at `/app/data` and set these runtime variables:

| Variable | Value |
|---|---|
| `DATA_DIR` | `/app/data` |
| `RAILWAY_RUN_UID` | `0` (Railway's documented setting for root-owned volumes) |
| `APP_ORIGIN` | Exact final `https://…` domain, without a trailing slash |
| `AUTH_PASSWORD_HASH` | Owner-generated value from local `pnpm auth:setup` |
| `AUTH_TOTP_SECRET` | Owner-generated value from local `pnpm auth:setup` |
| `SESSION_SECRET` | Owner-generated value from local `pnpm auth:setup` |

Generate credentials in your own terminal, enroll the QR locally, and transfer each value to Railway Variables. Paste the value **without** the surrounding dotenv single quotes. Preserve the bcrypt `$` characters. Never commit `.env.local`, QR images, runtime JSON, backups or credential values to Git. If the domain is not known yet, the initial deployment can remain in the locked setup state until the Railway domain is generated and auth variables are configured; no private page is accessible without login.

Railway currently mounts volumes as root. Its documented `RAILWAY_RUN_UID=0` override makes the mounted data directory writable, but means this Railway deployment runs as root inside its container; the ordinary Docker/Compose image still defaults to the `node` user. Do not omit the override and assume the image's build-time `chown` changes a subsequently mounted volume. The runtime refuses Railway startup without a configured persistent volume or with DATA_DIR outside that volume. File permissions or an unwritable volume also cause initialization to fail, before HTTP readiness.

`railway.json` pins the Dockerfile builder, one replica, Serverless/app sleeping disabled, the required volume mount, `/api/health`, restart-on-failure, no deployment overlap and a 30-second drain period. These settings keep the in-process ET scheduler available. They do **not** create a volume, configure GitHub linkage, insert secrets, or prove the service's actual platform settings. Keep one region/replica; do not configure a Railway cron service for this always-running app. Volume deployments have brief downtime, so deploy away from scheduled market runs and verify the next preview/final/catch-up. There is no separate pre-deploy seeding command: volumes only become available at runtime.

Repeatable local pre-push checks:

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm smoke
E2E_PRODUCTION=1 pnpm test:e2e
```

`pnpm build` includes the Python-exported parity gate. `pnpm smoke` copies the production artifact to a temporary directory, simulates a Railway volume and dynamic port, checks fail-closed startup, real password/TOTP login, HTTPS-origin handling, seven protected pages, browser JS serving, CSRF rejection and persistence across restarts. It uses only disposable test credentials/account input. It does not contact Yahoo, deploy a service, or alter real data. An HTTPS origin with proxy headers is simulated over local HTTP; this does not test Railway's TLS or actual volume ownership.

After the Git-triggered deployment, verify public health, actual browser password/TOTP login and a portfolio save, then redeploy once to confirm the saved state survives. Check startup logs for seed readiness and all three ET schedules. Test phone login and observe three unattended trading days. Revert the Git change for a code rollback; do not delete the persistent volume. A code rollback does not roll back data, and future incompatible schemas need a backup/restore plan. Live market-data blockers remain independent of successful deployment.

Primary platform references checked during the pre-push review: Railway [Volumes](https://docs.railway.com/volumes), [Config as Code](https://docs.railway.com/config-as-code/reference), [Healthchecks](https://docs.railway.com/deployments/healthchecks), [Serverless](https://docs.railway.com/deployments/serverless), and [Monorepo](https://docs.railway.com/deployments/monorepo).
