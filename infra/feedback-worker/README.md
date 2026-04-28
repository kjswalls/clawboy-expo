# clawboy-feedback-worker

Cloudflare Worker that turns ClawBoy in-app feedback submissions into GitHub
Issues on [`kjswalls/clawboy-feedback`](https://github.com/kjswalls/clawboy-feedback).

The intake repo is **private** so that user-submitted text, contact details, and
screenshot attachments are never publicly indexed or crawled. Users receive an
in-app confirmation (report number) and do not need GitHub access to track their
submission.

## What it does

```
ClawBoy app  ──POST /v1/feedback──▶  Worker  ──▶  GitHub Issues API
                                       │
                                       ├──▶  KV: rate-limit counters (5/h, 30/d per IP)
                                       └──▶  KV: clientNonce idempotency (24h)
```

Authenticates with a **fine-grained PAT** scoped to `Issues: Read and write`
and `Contents: Read and write` on `kjswalls/clawboy-feedback` only — held in a
Cloudflare Worker secret, never in source.

## Endpoints

| Method | Path             | Purpose                            |
| ------ | ---------------- | ---------------------------------- |
| `POST` | `/v1/feedback`   | Create an issue from the app form. |
| `GET`  | `/healthz`       | Liveness check.                    |

### Request schema

```ts
{
  kind: 'bug' | 'feature',
  title: string,            // 4..120 chars
  body: string,             // 10..8000 chars
  contact?: string,         // optional, <=200 chars
  diagnostics?: { /* whitelist — see worker source */ },
  screenshots?: Array<{     // optional, max 3
    mimeType: 'image/jpeg',
    base64: string,         // compressed JPEG; <=1.3 MiB per image, <=4 MiB total
  }>,
  clientNonce: string       // random UUID for idempotency
}
```

### Response

```ts
// success
{ ok: true,  issueUrl: string, issueNumber: number }

// failure
{ ok: false, error: 'method_not_allowed' | 'invalid_json' | 'validation'
                  | 'leak_blocked'      | 'rate_limited' | 'upstream_github'
                  | 'server_error',
  message?: string,
  retryAfter?: number  /* seconds, on rate_limited */ }
```

## One-time setup

### 1. Repository prep

- Create `kjswalls/clawboy-feedback` as a **private** repository. Initialize it
  with a README so the default branch (`main`) exists — the worker commits
  screenshot files to this branch.
- Confirm these labels exist (Issues → Labels): `from-app`, `bug`,
  `enhancement`, `needs-triage`. Create any that are missing.
- Note: `.github/ISSUE_TEMPLATE/` templates live in `kjswalls/clawboy-expo`
  (the public source repo) for contributor-filed issues only. The worker
  constructs issue bodies directly and does not use templates.

### 2. Create the fine-grained PAT

1. Go to **GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Fill in:
   - **Token name**: `clawboy-feedback-worker`
   - **Resource owner**: `kjswalls`
   - **Repository access**: Only select repositories → `kjswalls/clawboy-feedback`
   - **Repository permissions → Issues**: `Read and write`
   - **Repository permissions → Contents**: `Read and write` (required to upload screenshot files)
   - All other permissions: `No access`
   - **Expiration**: pick a date (GitHub max is 366 days). Set a calendar
     reminder — GitHub also emails you before it expires.
3. Click **Generate token** and copy the `github_pat_…` string immediately.
   GitHub will not show it again.
4. If rotating from a previous PAT that was scoped to `clawboy-expo`, revoke
   that token after verifying the new deployment works.

### 3. Cloudflare account + Worker

```bash
cd infra/feedback-worker
npm install
npx wrangler login
```

Create the KV namespace and copy the returned ID into `wrangler.toml`:

```bash
npx wrangler kv namespace create FEEDBACK_KV
# wrangler will print:
#   [[kv_namespaces]]
#   binding = "FEEDBACK_KV"
#   id = "abcdef0123..."
```

Replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.toml` with that `id`.

### 4. Set secrets

All `wrangler` commands must use this package's config. Either **change
directory** into the worker, or pass **`--cwd`** from the monorepo root; if
wrangler is run at the repo root with no config, you get **"Required Worker
name missing"**.

**Secret name is only `GITHUB_PAT` — the token is not a command-line
argument.** Wrangler prompts for the value; paste the `github_pat_…` string
and press Enter (or pipe into stdin: `printf '%s' "$GITHUB_PAT" | npx wrangler
secret put GITHUB_PAT` from this directory). Do not pass the token as a second
positional: that becomes the secret *name* and is invalid.

```bash
cd infra/feedback-worker
npm run secret:put-pat
# or: npx wrangler secret put GITHUB_PAT
```

From the monorepo root (without `cd`):

```bash
npx wrangler --cwd infra/feedback-worker secret put GITHUB_PAT
```

(Optional) tighten CORS if a web target is ever added:

```bash
npx wrangler secret put ALLOWED_ORIGINS
# value: https://app.clawboy.example
```

### 5. Deploy

```bash
npx wrangler deploy
```

Wrangler prints the deployed URL, e.g.
`https://clawboy-feedback-worker.<account>.workers.dev`. Smoke test:

```bash
curl https://clawboy-feedback-worker.<account>.workers.dev/healthz
# → {"ok":true}
```

### 6. Custom domain (optional)

If `clawboy.app` is on Cloudflare DNS:

1. Cloudflare dashboard → **Workers & Pages → clawboy-feedback-worker → Triggers → Add Custom Domain**.
2. Enter `feedback.clawboy.app`, click **Add**.
3. Cloudflare provisions the cert and routes traffic. No DNS edits needed.

If `clawboy.app` is on another DNS provider, add a `CNAME` for `feedback`
pointing at `<worker>.workers.dev`, and add the custom domain in the
Worker's Triggers page.

The app reads `extra.feedbackProxyUrl` from `app.json`. Update it to
`https://feedback.clawboy.app/v1/feedback` (or the workers.dev URL during
testing).

## Local development

```bash
npx wrangler dev
# Worker is up on http://127.0.0.1:8787
```

`wrangler dev` uses local KV by default. To exercise the real GitHub flow
locally, set the secrets via `wrangler secret put` (they apply to remote
deploys; for local you can use a `.dev.vars` file — see Wrangler docs).

## Operational notes

- **Logs**: `npx wrangler tail` for live tail. `console.error` calls are the
  only persistent surface — Workers does not retain stdout long-term.
- **KV consistency**: rate-limit counters are eventually consistent across
  CF regions. A determined attacker could squeeze ~2x the limit in a burst.
  Acceptable for this surface; tighten later via Durable Objects if needed.
- **Idempotency**: `clientNonce` is keyed for 24h. The app generates a new
  one each time the user opens the feedback sheet (not per submit attempt),
  so re-tapping "Submit" after a transient failure replays cleanly. Screenshot
  files use the same nonce as their path prefix (`feedback-attachments/{nonce}/`),
  so a retry re-uses the existing files via a GET+PUT with SHA rather than creating
  duplicates.
- **Screenshot storage**: uploaded JPEG files live under `feedback-attachments/`
  in `kjswalls/clawboy-feedback` at `GITHUB_DEFAULT_BRANCH` (default: `main`).
  Each submission gets its own `{clientNonce}/` subdirectory. These files
  accumulate over time; periodic manual cleanup or an automated script (e.g. a
  GitHub Actions cron) may be desirable. The leak-pattern filter is **not**
  applied to image base64 — only to `title`, `body`, and `contact` text fields.
- **Leak filter**: blocks `wss?://`, `https?://`, `Bearer …`, `token=…`, and
  JWT-shaped tokens in `title`/`body`/`contact`. The app side already
  refuses to include these in diagnostics, so this is defence-in-depth.
- **Branch config**: `GITHUB_DEFAULT_BRANCH` in `wrangler.toml` controls which
  branch screenshot files are committed to. Defaults to `main`.
- **PAT rotation**: the fine-grained PAT expires on the date you chose during
  setup. To rotate: generate a new token in GitHub (same settings — Issues: Read
  and write, Contents: Read and write, scoped to `clawboy-feedback`), then run
  `npx wrangler secret put GITHUB_PAT` and paste the new value. No redeploy
  needed — Cloudflare picks up new secrets on the next request.

## Threat model summary

| Threat                                | Mitigation                                                         |
| ------------------------------------- | ------------------------------------------------------------------ |
| App bundle leaks GitHub credentials   | Only the public Worker URL ships in the app; secrets live in CF.   |
| Attacker spams issues from any IP     | KV rate limit (5/h, 30/d). Add Turnstile if abuse appears.         |
| User accidentally pastes gateway URL  | Leak regex blocks `wss?://`, `https?://`, etc. before submit.      |
| User accidentally pastes auth token   | `Bearer …`, `token=…`, JWT-shaped patterns blocked by leak regex.  |
| Worker PAT compromise                 | Token only in CF Worker secret. Rotate via GitHub fine-grained tokens; scoped to Issues:write + Contents:write on `clawboy-feedback` only. |
| Replay of a stale submission          | `clientNonce` idempotency returns the original `issueUrl`.         |
| User text/screenshots indexed publicly | Intake goes to a **private** repo (`clawboy-feedback`); the public source repo (`clawboy-expo`) never receives in-app submissions. |
