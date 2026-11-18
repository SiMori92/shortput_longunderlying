# Railway auto-deployment: shortput_longunderlying

Repository: [SiMori92/shortput_longunderlying](https://github.com/SiMori92/shortput_longunderlying)

The app is at the repository root. Deploy branch `main`, Root Directory `/`, Railway Config File `/railway.json`. Keep the Dockerfile start command; do not override it with `pnpm start`.

## 1. Create the service and storage

1. In Railway, create a new **Empty Project** (or open the project you want to use).
2. Add an **Empty Service** and name it `strategy-monitor`. Creating it empty lets you configure storage before its first deployment.
3. Add a **Volume**, attach it to this service, and set its mount path to `/app/data`.
4. In the service's **Variables**, add `DATA_DIR=/app/data` and `RAILWAY_RUN_UID=0`.
5. Keep one replica in one region. Disable **Serverless/App Sleeping**, since the daily scheduler must run without browser traffic.

Railway's root-owned volume requires the documented UID override for this image. This Railway service consequently runs as root within the container; the ordinary Docker image defaults to the non-root `node` user. The checked-in config requires the mount, but does not create it for you.

## 2. Connect GitHub and deploy

1. Open the service's **Settings → Source**, choose **Connect Repo**, and select `SiMori92/shortput_longunderlying`.
2. If the repository is missing, configure Railway's GitHub app access for that repository under the owning GitHub account.
3. Select branch `main` and enable automatic deployments for pushes to that branch.
4. Set **Root Directory** to `/` and **Railway Config File** to `/railway.json`.
5. Confirm the builder is **Dockerfile**. Leave custom build/start/pre-deploy commands empty; Dockerfile runs the parity-gated build and starts `node server.js`.
6. Leave **Wait for CI** off unless you separately configure GitHub checks. The Docker build itself already runs the test/parity gate.
7. Deploy the staged changes. In logs, confirm `[seed] Ready` and registration of preview 15:40, final 16:20 and catch-up 07:00 America/New_York.
8. Under **Settings → Networking → Public Networking**, choose **Generate Domain**. Use target port `3000` for the image's default; if you explicitly set `PORT`, use that value for the domain too.

`railway.json` configures the health endpoint `/api/health`, one instance, sleeping disabled, `/app/data`, retries and the deployment drain period. The first successful deployment can show a locked **Setup required** page until you add owner authentication. A successful health check does not mean live trading recommendations are valid.

## 3. Create your login locally

Login is an account name plus password (no authenticator app). In your local checkout, with Node 24+ and pnpm 10.20.0 installed:

```sh
pnpm install --frozen-lockfile
pnpm auth:setup
```

Enter an account name (3-64 characters: letters, digits, `. _ @ -`; case-sensitive), choose a password of 8+ characters, confirm it, and enter the exact HTTPS Railway domain with no trailing slash. The command saves `.env.local` with permissions 0600. It refuses to overwrite an existing file; delete the old `.env.local` first if you are deliberately replacing credentials.

In Railway **Variables**, add the four generated values from `.env.local`:

| Name | Value |
|---|---|
| `AUTH_USERNAME` | Your account name |
| `AUTH_PASSWORD_HASH` | Generated bcrypt password hash (not your password) |
| `SESSION_SECRET` | Generated session signing secret |
| `APP_ORIGIN` | Exact HTTPS Railway domain; no trailing slash |

Paste each value **without** the surrounding dotenv single quotes. Preserve `$` characters in the password hash. Save/deploy the variable changes. If you previously set `AUTH_TOTP_SECRET`, delete it; it is no longer used. Keep a password-manager backup of the account name and password. Do not upload `.env.local` or runtime data to GitHub. Never prefix these variables with `NEXT_PUBLIC_`.

Five failed sign-ins within 15 minutes lock login for the rest of that window (successful sign-ins don't count). Because there is no second factor, use a long, unique password.

Do not set `RAILWAY_VOLUME_MOUNT_PATH` yourself: Railway provides it when the volume is attached. Do not override `HOSTNAME` with a loopback address. Railway's Docker runtime binds to `0.0.0.0` and honors `PORT`.

## 4. Verify the deployed service

1. Visit your HTTPS domain: anonymous access redirects to login.
2. Visit `/api/health`: it should return `status: "ok"`; `strategyReady: false` remains intentional.
3. Sign in using your account name and password; open all seven dashboard pages.
4. Enter an accurate portfolio snapshot if ready. Redeploy the same commit once and verify that snapshot persists. This verifies the real Railway volume, not just local filesystem behavior.
5. Verify sign-out, phone login and the next scheduled runs. Do not treat an HTTP health check as proof Yahoo data or account actions are valid.

Known data-review blockers remain: the SOXX split event, missing historical IRX sessions and the absence of a real account snapshot. Deployment does not bypass them.

## 5. Subsequent automatic deployments

Make future edits in the local `WebApp/` checkout (now the Git root), then:

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm smoke
git add <changed-files>
git commit -m "Describe the change"
git push origin main
```

Railway detects the push to `main`, builds the Docker image and runs its mandatory test/parity gate. If the build passes and `/api/health` becomes healthy, the new deployment becomes active. Volumes can cause brief deployment downtime, so deploy away from market runs. Preserve the volume for rollback; use a Git revert/redeploy for code and an independently protected backup for data recovery.

If a deploy fails, first check the build/deploy logs. Missing volume, wrong DATA_DIR, non-writable storage, an overridden start command, mismatched target port or incorrectly quoted auth values should be corrected in settings rather than by weakening validation.

References: [GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys), [Volumes](https://docs.railway.com/volumes), [Config as code](https://docs.railway.com/config-as-code/reference), [Healthchecks](https://docs.railway.com/deployments/healthchecks).
