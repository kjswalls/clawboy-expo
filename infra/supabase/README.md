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

### 2. Site URL and redirect URLs (do this before providers)

The app uses Expo scheme **`clawboy`** and auth redirect **`clawboy://auth-callback`** (see `app.json`). Supabase must allow both the hosted callback and the deep link.

1. In Supabase: **Authentication → URL configuration**.
2. **Site URL**: set a stable value for production (e.g. your marketing site). For local-only testing you can use `http://localhost:3000`.
3. Under **Redirect URLs**, add **both** (replace `<your-project-ref>` with the subdomain from **Project Settings → API → Project URL**):

   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   clawboy://auth-callback
   ```

   OAuth providers (Apple, Google) redirect to the `https://…/auth/v1/callback` URL first; email magic links and completed OAuth flows can return to the app via `clawboy://auth-callback`. Save after editing.

### 3. Email — magic link (passwordless)

1. **Authentication → Providers → Email** → enable the provider.
2. Prefer **magic link** / OTP email flows; turn **password** sign-in **off** if you want passwordless-only (matches the app’s `signInWithOtp` usage).
3. Optional: **Authentication → Email templates** — customize the magic-link email copy for ClawBoy.
4. Recommended for production: configure **custom SMTP** under project Auth settings so mail is reliable and not heavily rate-limited; Supabase’s built-in sender is fine for first tests.
5. The link in the email must redirect to a URL listed under **Redirect URLs** — keep **`clawboy://auth-callback`** listed exactly.

### 4. Apple — Sign in with Apple

Requires [Apple Developer Program](https://developer.apple.com/programs/) membership.

#### A. App ID (bundle identifier)

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → **Identifiers**.
2. Open your iOS **App ID** (or create one). Its **Bundle ID** must match **`ios.bundleIdentifier`** in `app.json` (e.g. `com.anonymous.clawboy-expo`).
3. Enable capability **Sign In with Apple** → Save.

#### B. Services ID (OAuth / Supabase callback)

1. **Identifiers** → **+** → **Services IDs**.
2. **Identifier**: e.g. `com.yourcompany.clawboy.auth` (reverse-DNS; unique in your account).
3. Enable **Sign In with Apple** → **Configure**:
   - **Primary App ID**: the App ID from step A.
   - **Domains and Subdomains**: `YOUR_PROJECT_REF.supabase.co` (no `https://`).
   - **Return URLs**: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. Save and note the Services ID string.

#### C. Key (.p8)

1. **Keys** → **+** → enable **Sign In with Apple** → associate with the App ID from step A → Register.
2. Download the **`.p8`** file once; store it securely. Note **Key ID**.
3. Note **Team ID** (Apple Developer account / Membership).

#### D. Supabase dashboard

1. **Authentication → Providers → Apple** → enable.
2. Enter **Services ID**, **Key ID**, **Team ID**, and private key (or **Secret Key** / client secret per field labels — Supabase may ask for a JWT derived from the `.p8`; follow [Supabase — Login with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple) for the exact format your project shows).
3. If there is a **Client IDs** (or similar) field accepting multiple values, include **both** the **Bundle ID** (native) and **Services ID** (OAuth) when the docs require both.

#### E. App Review

If the app offers Google sign-in on iOS, Apple requires Sign in with Apple to be offered too — mention that in App Review notes if needed.

### 5. Google — OAuth

#### A. OAuth consent screen

1. [Google Cloud Console](https://console.cloud.google.com/) → select or create a project.
2. **APIs & Services → OAuth consent screen** → External (typical) → app name, user support email, developer contact.
3. Scopes: at minimum **openid**, **email**, **profile**.
4. While the app is in **Testing**, add **Test users** (Google accounts allowed to sign in).

#### B. Web OAuth client (for Supabase)

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized redirect URIs** → add exactly:

   ```
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

4. Create → copy **Client ID** and **Client Secret**.

#### C. Optional: iOS OAuth client

If you later add a native Google SDK, create an additional **iOS** OAuth client with the same Bundle ID. The current ClawBoy flow uses Supabase browser OAuth (`signInWithOAuth`); the **Web** client above is usually sufficient.

#### D. Supabase dashboard

1. **Authentication → Providers → Google** → enable.
2. Paste **Client ID** and **Client Secret** from the **Web** OAuth client → Save.

### 6. Provider smoke tests

| Provider | Check |
|----------|--------|
| Email | Magic link arrives → opens app → user appears under **Authentication → Users**. |
| Apple | Sign in on device → session/user in dashboard. |
| Google | Browser OAuth completes → app receives session after redirect. |

**Common issues:** typo in redirect URLs (wrong project ref, `http` vs `https`); Apple Return URL must exactly match `https://…supabase.co/auth/v1/callback`; Google project still in Testing → only test users can sign in; Bundle ID mismatch between Apple App ID and built app.

### 7. Run the migration

```bash
# Using Supabase CLI (recommended)
supabase login
supabase link --project-ref <your-project-ref>
supabase db push

# Or manually: paste migrations/0001_init.sql into the SQL Editor
```

### 8. Deploy the account-delete Edge Function

```bash
supabase functions deploy account-delete --no-verify-jwt
```

Set these environment variables in **Dashboard → Settings → Edge Functions**:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_ANON_KEY` | Your project anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your project service role key |

### 9. Wire up the app

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
