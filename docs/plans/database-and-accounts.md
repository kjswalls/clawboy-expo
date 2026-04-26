# Database, accounts, and cross-device sync — research & plan

> Status: **Research / not implemented.** No ClawBoy-owned database today; this doc captures when to add one and what belongs where.
> Last updated: 2026-04-24

Related:

- [Option B — Encrypted Chat Cache](./option-b-encrypted-chat-cache.md) — local persistence inventory; §9 cross-platform sync (gateway as source of truth)
- [Push Notifications](./push-notifications.md) — device push registration lives on the gateway, not in a vendor DB
- [.cursorrules](../../.cursorrules) — security rules for tokens, SecureStore, and sensitive data

## TL;DR

ClawBoy is a **pure client**: no server-side database in this repo. **The OpenClaw gateway is the source of truth** for sessions, chat history, agents, models, and server config. Local state uses `expo-secure-store` (secrets), `@react-native-async-storage/async-storage` (non-sensitive prefs), and (planned) encrypted on-disk chat cache for cold-start UX only.

**Do not add a vendor database until there is a concrete trigger** (accounts / IAP entitlements, plugin registry, or cross-gateway profile list sync). When sync is needed for *settings tied to a gateway*, prefer **gateway RPCs** (e.g. `prefs.get` / `prefs.set`) over a ClawBoy cloud. When sync needs **vendor identity before any gateway exists** or **entitlements across gateways**, add a **thin cloud** (Supabase is a strong default): Postgres + Auth + RLS, storing **only** account metadata, entitlements, and non-secret profile URLs — **never** chat content, gateway tokens, or device private keys.

---

## 1. Current persistence (no DB)

| Layer | API | Used for | Security |
| --- | --- | --- | --- |
| Secrets | `expo-secure-store` | Gateway auth tokens, Ed25519 device identity, device tokens after pairing, chat-cache AES key | Keychain / EncryptedSharedPreferences |
| Non-sensitive prefs | `@react-native-async-storage/async-storage` | Server profile records (no tokens), pinned session keys, theme, current agent/model, UI prefs | Plaintext sandbox |
| Runtime | `useRef` / `useState` | Message cache, connection state, stream state | In-memory only |
| Planned | Encrypted files under app document dir | Last-session tail for cold start (see [Option B](./option-b-encrypted-chat-cache.md)) | AES-GCM, key in SecureStore |

### Key code references

- Server profiles + token split: [`src/hooks/useServerConfig.tsx`](../../src/hooks/useServerConfig.tsx)
- Device identity + signing: [`src/lib/device-identity.ts`](../../src/lib/device-identity.ts)
- Chat cache primitives: [`src/lib/chatCache/`](../../src/lib/chatCache/)
- Theme persistence: [`src/contexts/ThemeContext.tsx`](../../src/contexts/ThemeContext.tsx)
- Agent/model selection persistence: [`src/hooks/useAgents.tsx`](../../src/hooks/useAgents.tsx), [`src/hooks/useModels.tsx`](../../src/hooks/useModels.tsx)
- Pinned sessions: [`src/hooks/useSessions.tsx`](../../src/hooks/useSessions.tsx)

There is **no SQLite**, no remote SQL, and no sync primitive for chat data beyond what the gateway already provides over WebSocket (`sessions.*`, `chat.*`, `config.*`, `device.pair.*`).

---

## 2. What actually needs a “database” vs the gateway

| Need | ClawBoy-owned DB? | Notes |
| --- | --- | --- |
| Chat history across devices | **No** | Gateway: `sessions.list`, `chat.history`, stream events |
| Pins, preferred model/agent (per gateway) | **Maybe** | Today local only; sync via gateway `prefs.*` if users ask |
| Server profile list (URLs + names, **no tokens**) | **Maybe** | “New device, don’t retype four gateways” — thin cloud *or* user export/import |
| Gateway auth tokens | **Never** | Per-device bearer creds → SecureStore only |
| Ed25519 device private keys | **Never** | Per install; pairing is per device ([`device-identity.ts`](../../src/lib/device-identity.ts)) |
| Push token binding | **No** | Gateway-side registration (see [Push Notifications](./push-notifications.md) Phase 2) |
| User accounts (OAuth / email) | **Only if** we ship vendor features that need them | IAP, plugin store, optional cloud backup of *non-secret* prefs |
| Entitlements (paid tier) | **Yes** when monetizing | Apple receipt validation + durable store |
| Plugin registry (metadata, versions, signatures) | **Yes** when shipping plugins | Often static index + signatures; not necessarily full app DB |

**Structural reasons for a ClawBoy cloud** (cannot be solved by gateway alone):

1. Bootstrap identity **before** the user has configured any gateway.
2. Entitlements that span **multiple** self-hosted gateways under one “ClawBoy account.”
3. Central **plugin distribution / signing** policy (what the app trusts), separate from any one user’s gateway.

Everything else can default to **extend the OpenClaw gateway protocol** so data stays in the user’s trust boundary.

---

## 3. Architecture options

### Option A — Gateway-only prefs

Add RPCs such as `prefs.get` / `prefs.set` (names illustrative) scoped to the connected gateway + paired device. Clients pull on connect and push on change.

- **Pros:** No vendor infra; aligns with self-hosted OpenClaw; settings live with chat; compatible with cert-pinning mental model.
- **Cons:** No pre-gateway bootstrap; no cross-gateway “ClawBoy account” entitlements; multi-gateway users may want prefs **per** gateway anyway (often correct).

**When:** First concrete ask for “same pins / theme on iPad and Mac against *this* gateway.”

### Option B — Thin ClawBoy cloud (e.g. Supabase)

Postgres + Auth + Row Level Security. Tables might include `accounts`, `devices`, `server_profiles` (URL + label only), `entitlements`, optional `prefs` key/value — **explicitly excluding** messages, tool output, thinking, gateway tokens, and private keys.

- **Why Supabase is a good default:** Postgres + RLS, managed auth (Apple/Google, etc.), Expo-friendly client, optional Realtime, open-source/self-host path if we ever need it.
- **Alternatives:** Convex (realtime-first), Clerk + Neon (auth + BYO DB), Turso/D1 (edge SQL, more DIY), Firebase (works but heavier lock-in).

### Option C — Hybrid (recommended when triggers land)

- **Gateway:** chat + per-gateway prefs (`prefs.*`).
- **Cloud:** accounts, entitlements, optional cross-gateway profile list (no tokens), plugin install metadata / registry pointers.

**Worst-case if cloud is breached:** attacker learns account exists, which gateway URLs were saved (labels/URLs), tier — **not** chat content and **not** ability to authenticate as the user to gateways.

---

## 4. Triggers → action

| Trigger | Action |
| --- | --- |
| Cross-device pins / theme / model **for one gateway** | Option A — small gateway PR + client hook |
| IAP / licenses / “Pro” across installs | Option B — receipts + `entitlements` table |
| Plugin installs synced across platforms | Option B — `plugin_installs` + signed distribution channel |
| “Restore my gateway URLs on a new phone” | Option B — `server_profiles` without tokens; each device still pairs separately |
| Push when assistant completes | Gateway only ([Push Notifications](./push-notifications.md)) |

Until one of these is on the roadmap, **stay with no ClawBoy database.**

---

## 5. Non-negotiables (if we add a cloud)

1. **Never store chat content** in ClawBoy vendor infra (messages, tools, thinking, previews).
2. **Never store gateway auth tokens** in the cloud — device-local only.
3. **Never store or sync Ed25519 private keys** — one keypair per install.
4. **RLS on every tenant table** — e.g. `account_id = auth.uid()` on all reads/writes.
5. **Separate auth** from gateway auth — cloud JWT vs gateway token; two systems, two purposes.
6. **App works without the cloud** — local-only / offline-first for core “connect to my gateway” flow; cloud is enrichment.
7. **Opt-out** — “local only, no ClawBoy account” remains supported for users who refuse vendor accounts for a self-hosted workflow.
8. **Account deletion** — cascade deletes and documented retention for compliance.

See [.cursorrules](../../.cursorrules) §Security — especially “Never log, cache, or persist sensitive data in plaintext” and SecureStore vs AsyncStorage rules.

---

## 6. Multi-platform notes

- **Web:** `expo-secure-store` is weaker; treat gateway tokens as session-scoped where needed; skip heavy encrypted local chat cache on web (see [Option B §9](./option-b-encrypted-chat-cache.md)).
- **Desktop:** Same local storage patterns as mobile; Option A prefs RPC maps cleanly iOS ↔ desktop without a central DB.
- **Plugins:** If plugins run privileged code, **signing + policy** matters more than which DB product we pick; registry can be static hosting plus a small DB for per-user enablement.

---

## 7. Decision log

- **2026-04-24** — Documented research: no ClawBoy DB today; gateway owns authoritative chat/session/config; prefer gateway `prefs.*` for cross-device settings tied to a gateway; add thin Supabase-class cloud only for accounts, entitlements, optional non-secret profile sync, and plugin metadata — never tokens, never device keys, never chat.
- **2026-04-26** — Identity layer (Supabase-only, no Cloudflare Worker, no push) selected and implemented. Apple Sign-In + Google (via expo-auth-session) + Email magic-link. Supabase access/refresh tokens stored in `expo-secure-store`. `AccountProvider` added to `app/_layout.tsx` outside `ConnectionProvider`. All local-only flows (gateway pair → chat → sessions) are unaffected when signed-out. Push notifications, IAP, and the Cloudflare Worker are deferred to follow-up plans. See [`.cursor/plans/supabase_accounts_and_push_relay_533ae5fe.plan.md`](../../.cursor/plans/supabase_accounts_and_push_relay_533ae5fe.plan.md) for the full design.
