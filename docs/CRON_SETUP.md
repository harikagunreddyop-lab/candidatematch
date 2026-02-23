# Cron: Scheduled Job Matching

The app exposes a **cron endpoint** that runs job matching on a schedule (e.g. every 6 hours). Use an external cron service to call it; Amplify does not run cron jobs by itself.

## 1. Set env in Amplify

In **Amplify Console** → your app → **Environment variables**:

| Variable        | Value                    | Notes                                      |
|----------------|--------------------------|--------------------------------------------|
| `CRON_SECRET`  | A long random string     | Generate one; the cron service will send it. |
| `USE_ELITE_ATS`| `1`                      | You already set this for Elite ATS.        |

Generate a secret (example):

```bash
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

Or use a password generator and paste a 32+ character string.

Redeploy after adding or changing `CRON_SECRET`.

## 2. Cron endpoint

- **URL:** `GET https://<your-amplify-url>/api/cron/match`  
  Example: `https://master.d1zctiy8vgnlrr.amplifyapp.com/api/cron/match`
- **Auth:** `Authorization: Bearer <CRON_SECRET>`
- **Method:** GET

The route runs matching (incremental by default; full run as fallback when needed). `maxDuration` is 300 seconds.

## 3. Use a cron service

Pick one and point it at the URL with the header.

### Option A: cron-job.org (free)

1. Sign up at [cron-job.org](https://cron-job.org).
2. Create a job:
   - **URL:** `https://<your-amplify-url>/api/cron/match`
   - **Schedule:** e.g. every 6 hours (`0 */6 * * *` or use the 6-hour preset).
   - **Request method:** GET.
   - **Request headers:**  
     `Authorization` = `Bearer YOUR_CRON_SECRET` (use the same value as in Amplify).
3. Save and enable.

### Option B: AWS EventBridge (if app is on AWS)

1. Create a rule with schedule expression, e.g. `rate(6 hours)`.
2. Target: **API destination** or a **Lambda** that calls your Amplify URL with `Authorization: Bearer <CRON_SECRET>`.

### Option C: GitHub Actions (if repo is on GitHub)

Add a workflow that runs on schedule and calls the endpoint with the secret stored in repo secrets.

## 4. Verify

- Call the URL manually with the correct `Authorization` header; you should get JSON (e.g. `ok: true`, `elapsed_ms`, …), not 401.
- If you get **401 Unauthorized**, check that `CRON_SECRET` in Amplify matches the value in the `Bearer` token exactly (no extra spaces).

## USE_ELITE_ATS

With `USE_ELITE_ATS=1` in Amplify (all branches), matching uses the Elite ATS engine (Claude Sonnet Batches API). No code or DB change needed; the cron endpoint uses the same matching pipeline.
