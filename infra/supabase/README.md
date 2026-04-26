# ClawBoy — Supabase infra

Optional identity layer for ClawBoy. **Local-only users who never sign in can ignore everything here** — the gateway pair → chat → sessions flow does not touch Supabase.

## What lives here

| Path | Purpose |
|------|---------|
| `migrations/0001_init.sql` | Initial schema: `accounts`, `server_profile_pointers`, `entitlements` + RLS |
| `functions/account-delete/` | Edge Function: cascade delete account + revoke auth |

## What is deliberately NOT here

- Gateway auth tokens — device-local in `expo-secure-store` only
- Chat content, session history, tool outputs — gateway owns these
- Ed25519 device private keys — one keypair per install, never leaves the device
- Push subscriptions / device registration — deferred to follow-up push plan
- IAP/Stripe receipts — deferred to follow-up monetization plan

## One-time project setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **Project URL** and **anon key** (Settings → API)
3. Note your **service role key** (needed for the Edge Function env var only — never ship this to the app)

### 2. Configure auth providers

In the Supabase dashboard → Authentication → Providers:

- **Email** — enable "Magic Link" (disable password sign-in if you prefer OTP-only)
- **Apple** — enable; paste your Apple Services ID and key credentials
- **Google** — enable; paste your Google OAuth client ID and secret

For the Apple redirect URL, add:
```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

For the iOS deep-link return (email magic-link), add the following to **URL configuration → Redirect URLs**:
```
clawboy://auth-callback
```

### 3. Run the migration

```bash
# Using Supabase CLI (recommended)
supabase login
supabase link --project-ref <your-project-ref>
supabase db push

# Or manually: paste migrations/0001_init.sql into the SQL Editor
```

### 4. Deploy the account-delete Edge Function

```bash
supabase functions deploy account-delete --no-verify-jwt
```

Set these environment variables in **Dashboard → Settings → Edge Functions**:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_ANON_KEY` | Your project anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your project service role key |

### 5. Wire up the app

In `app.json` → `extra`:

```json
{
  "supabaseUrl": "https://<your-project-ref>.supabase.co",
  "supabaseAnonKey": "<your-anon-key>"
}
```

> **Security note:** The anon key is safe to ship in the app bundle — it is public-facing and relies on Row Level Security to enforce access control. Never ship the `service_role` key in the app.

## Schema overview

```
auth.users (Supabase managed)
    │
    └─► public.accounts (1:1, ON DELETE CASCADE)
            │
            ├─► public.server_profile_pointers (1:N, ON DELETE CASCADE)
            │     Stores gateway URL + label only — NO tokens
            │
            └─► public.entitlements (1:1, ON DELETE CASCADE)
                  Tier plumbing — IAP wiring deferred
```

RLS default-deny on every table; all policies are `account_id = auth.uid()` or `id = auth.uid()`.

## Local development

```bash
supabase start          # starts local Postgres + Studio + Auth
supabase db reset       # applies all migrations from scratch
supabase functions serve account-delete  # local Edge Function dev
```
