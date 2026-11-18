# Pre-push smoke test — Railway

Date: 18 November 2026

Verdict: **Local artifact passes. Ready to push with the Railway prerequisites below; actual cloud deployment is not yet verified.** No Git push or Railway deployment was performed.

## Results

| Check | Actual result | Evidence |
|---|---|---|
| Unit/API/engine parity | 130 tests, 21 files passed | [prepush-test.log](prepush-test.log) |
| Production build, including parity gate | Passed | [prepush-build.log](prepush-build.log) |
| Lint | Exit 0, clean | [prepush-lint.log](prepush-lint.log) |
| Typecheck | Exit 0 | [prepush-typecheck.log](prepush-typecheck.log) |
| Production smoke | All checks passed | [prepush-smoke.log](prepush-smoke.log) |
| Production browser suite | 30 passed | [prepush-e2e-production.log](prepush-e2e-production.log) |
| Railway config | Valid against Railway's current official JSON Schema, draft 2020-12 | [prepush-railway-config.log](prepush-railway-config.log) |
| Git candidate exclusions/pattern scan | Required private paths excluded; deploy inputs includable; no key/token pattern matches in 302 candidates checked | [prepush-git-check.log](prepush-git-check.log) |
| Production dependency audit | No known vulnerabilities found | [prepush-audit.log](prepush-audit.log) |
| Source and real account data | Python/seed unchanged; actual manual records still empty; no owner credentials created | [prepush-provenance.log](prepush-provenance.log) |

Production screenshots at 360/768/1024/1440px are in [prepush-screenshots](prepush-screenshots/). Browser account/monitor inputs are isolated fixtures, not real positions or market data.

## Smoke coverage

The production standalone artifact was copied to a disposable directory and started with Railway-like environment values, `HOSTNAME=0.0.0.0`, a dynamically assigned `PORT`, simulated persistent storage and a configured HTTPS browser origin. The test verifies:

1. Missing persistent-volume configuration never passes HTTP readiness, does not seed data and does not register jobs.
2. A properly configured empty data directory seeds automatically and registers all three ET schedules.
3. All seven pages redirect anonymous access to login; portfolio/run/monitor APIs reject unsigned requests.
4. Real test password + TOTP login issues a Secure, HttpOnly, SameSite=Strict cookie.
5. An HTTPS configured origin works through simulated proxy headers, and a cross-site write returns 403 even with spoofed forwarded-host headers.
6. Bars, an API-entered test snapshot, a signed session and the used TOTP counter survive process restarts.
7. All seven authenticated pages return 200 with the expected h1; browser JavaScript assets are served.
8. Logout succeeds and unsigned API access remains blocked.
9. Deployable standalone output excludes runtime data, environment files, enrollment files, tests and reports.

Next keeps a process alive after an instrumentation failure, so the negative startup assertion checks readiness rather than process termination. Page-heading assertions strip React's SSR comment separators before comparing visible text. These were smoke-harness corrections, not strategy changes.

## Deployment fixes made during review

- Added `railway.json`: Dockerfile builder, one instance, sleeping disabled, required `/app/data` mount, `/api/health`, on-failure retries, zero deployment overlap and a 30-second drain period.
- Added a runtime guard rejecting Railway operation without persistent storage or with DATA_DIR outside it, including symlink escapes. Local Docker/host operation remains unchanged. Six focused tests cover the guard.
- Docker's healthcheck now follows runtime `PORT`, matching the standalone server.
- Added repeatable `pnpm smoke` and strengthened its deployment checks.
- Added Git/Docker exclusions for the documented backup archive and backups directory.
- Added Railway-specific README instructions for Git root/config-file paths, volume permissions, runtime credentials and rollback.

## Required Railway settings before relying on auto-deploy

- Build using the checked-in Dockerfile and config; leave the Docker start command intact. The host `pnpm start` intentionally binds to loopback and is not the Railway start command.
- Attach a persistent volume at `/app/data`; set `DATA_DIR=/app/data`.
- Set `RAILWAY_RUN_UID=0`, Railway's documented override for root-owned volumes. This Railway-specific choice runs as root within the container; ordinary Docker/Compose keeps the image's non-root default. Actual mounted-volume permissions have not been tested here.
- Set `AUTH_PASSWORD_HASH`, `AUTH_TOTP_SECRET`, `SESSION_SECRET` from owner-generated local setup, and `APP_ORIGIN` to the exact final HTTPS origin, without trailing slash. Paste values into Railway without dotenv's outer quotes. No owner credentials were created by this test.
- Keep one region/instance and Serverless/app sleeping disabled. The configuration file encodes supported deploy settings, but does not create a volume, connect GitHub or populate secrets.
- If Git contains `WebApp/` as a subdirectory, set Root Directory `/WebApp` and Railway Config File `/WebApp/railway.json`. If the repository root contains WebApp's contents directly, use `/` and `/railway.json` respectively. Railway's config-file path does not automatically follow Root Directory.

Official references checked: [Volumes](https://docs.railway.com/volumes), [Config as Code](https://docs.railway.com/config-as-code/reference), [Healthchecks](https://docs.railway.com/deployments/healthchecks), [Serverless](https://docs.railway.com/deployments/serverless), [Monorepo](https://docs.railway.com/deployments/monorepo), and the live schema at `https://railway.com/railway.schema.json`.

## Limits and post-deploy acceptance

- Docker is not installed locally. The actual Linux image, Railway UID/volume permissions, networking and TLS have not been exercised. Local HTTPS-origin simulation is not an end-to-end HTTPS test.
- Railway CLI is installed, but its OAuth refresh failed and the workspace has no linked Railway project. No account settings, live deployment, remote variables or volume attachment were verified or changed.
- The workspace is not a Git repository yet. Ignore rules were evaluated using an isolated temporary Git directory; no actual index, history, remote or CI status was available. Pattern scans cannot guarantee absence of all possible secrets.
- After auto-deploy, check public health, real browser login, a portfolio save and a second deployment that retains that save. Inspect startup/scheduler logs and test a real phone. Observe three unattended trading days before closing deployment acceptance.
- Railway volume deployments may have brief downtime. Deploy away from market runs; use Git code rollback plus a separately protected volume backup if recovery is needed. Never delete the volume for a normal rollback.
- Existing SOXX split review, missing IRX history and missing real account snapshot still block actionable live recommendations. A passing deployment healthcheck does not clear them.

Repeat locally with `pnpm build && pnpm smoke`; production browser checks use `E2E_PRODUCTION=1 pnpm test:e2e`.
