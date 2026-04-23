# Option B — Encrypted Chat Cache

Status: **Planned** — implementation not started.
Author: Design notes from reconnect/UX workstream.
Related: Option A (auto-reconnect on cold start) — already implemented in `src/hooks/useAutoReconnect.ts`, `src/components/chat/ConnectionBanner.tsx`, `src/components/chat/MessageListSkeleton.tsx`.

---

## 1. Problem

After Option A landed, cold-start UX is:

1. User opens app.
2. `ServerConfigProvider` hydrates from AsyncStorage (~ms).
3. `useAutoReconnect` fires `connect()` against the most-recently-used profile.
4. The socket handshake, device pairing, and `chat.history` RPC together take roughly **1–3 seconds on a warm Wi-Fi connection, longer on flaky networks**.
5. During that window the user sees: `ConnectionBanner` ("Reconnecting...") + `MessageListSkeleton` shimmer rows. Better than a blank screen, but still clearly a "not loaded yet" state.

**Goal of Option B:** replace the skeleton window with the *actual* last-seen messages from the session the user is about to resume, so cold start feels instantaneous. Then reconcile against the authoritative `chat.history` response when the socket is up.

---

## 2. Non-goals (explicit)

- We are **not** building an offline-browsing store. If the gateway is unreachable, the user sees their most recent session's tail and nothing else. Browsing older sessions or other conversations requires a live connection. This is acceptable per product decision.
- We are **not** building a search index. `Option B-lite` intentionally has no queryable schema.
- We are **not** syncing cached data between devices. The gateway is the source of truth; each install's cache is disposable.
- We are **not** caching the in-flight streaming message. Only finalized messages (`isStreaming === false`, or received via the `message` event) are persisted.

---

## 3. Current storage inventory (for context)

| Layer                       | API                                   | Used for                                                               | Security            |
|-----------------------------|---------------------------------------|------------------------------------------------------------------------|---------------------|
| Secrets                     | `expo-secure-store`                   | Gateway auth tokens, Ed25519 device identity                           | Keychain / EncryptedSharedPreferences |
| Non-sensitive prefs         | `@react-native-async-storage/async-storage` | Server profile records (no tokens), pinned session keys, theme   | Plaintext sandbox file |
| Runtime-only                | `useRef` / `useState`                 | `sessionCacheRef` (chat messages), `connectionState`, stream state     | In-memory only; gone on cold start |

No SQLite, no encrypted blob store, no sync primitive today.

---

## 4. Chosen approach: "Option B-lite" — a single encrypted JSON file per profile

### Why this instead of SQLCipher / `expo-sqlite`?

The original design (Section 8 below) proposed encrypted SQLite with a full schema, migrations, and capped session retention. That's the right answer **if** we're building search, offline browsing, bookmarks with content, or large caches. It is **overkill** for the stated goal of "bridge the 1–3 second reconnect gap with the most recent session's tail."

Trade-off accepted: start with a JSON blob. If roadmap items in Section 9 land, migrate up to SQLCipher. The migration is a one-shot read-JSON-insert-rows transform and loses nothing.

### Data model

**SecureStore:**

```
clawboy-cache-key-v1  →  hex-encoded 32 random bytes (AES-256-GCM key)
```

Generated on first launch via `expo-crypto` `getRandomBytesAsync(32)`. Never leaves SecureStore.

**Filesystem:**

```
FileSystem.documentDirectory/chatcache/<profileId>.enc
```

Contents (after AES-GCM decrypt):

```jsonc
{
  "version": 1,
  "profileId": "prof_lx3k_xyz",
  "sessionKey": "session-abc-123",
  "sessionTitle": "Debugging the reconnect hook",
  "agentId": "default",
  "modelId": "claude-sonnet-4.5",
  "updatedAt": 1729612345000,
  "messages": [
    /* last ~20 finalized messages, oldest first, shape = ChatMessage */
  ]
}
```

One file **per server profile**, overwritten in place. If the user has 3 profiles, 3 files. Total disk footprint measured in kilobytes.

**Retention policy (v1):**
- Only the **most-recently-active session** per profile.
- Last **20 messages** of that session (oldest first, so the tail fits on-screen without scrolling).
- If the user switches to a different session mid-run, the new session replaces the previous cache. We do not maintain per-session history.

### Encryption details

- Algorithm: AES-256-GCM, 12-byte random IV per write, no AAD (the file itself is the ciphertext).
- Serialized form on disk: `base64( iv || ciphertext || authTag )`.
- Wrappers live in a small `src/lib/chatCache/crypto.ts` using `expo-crypto` + the Web Crypto subtle API (available on Hermes in Expo SDK 50+). Fallback to `@noble/ed25519`-adjacent libs is unnecessary for symmetric crypto.
- If decryption throws (key rotated, file corrupted), we delete the file and proceed as cache-miss. Never retry, never surface an error to the user.

### Write path

Triggered inside `useChat` (or a new `useChatCachePersistence` hook observing it):

1. On `streamEnd` or `message` event for a real server session:
2. Debounce 500ms (merges a burst of tool-call events into one write).
3. Serialize `{ profileId, sessionKey, sessionTitle, agentId, modelId, updatedAt, messages: tail(20) }`.
4. Encrypt, base64-encode, write to `documentDirectory/chatcache/<profileId>.enc.tmp`, then `moveAsync` to final path. Atomic on all platforms.
5. Never write `isStreaming: true` messages — they're not persistence-worthy.
6. Never write for locally-created "main" sessions that haven't been registered with the gateway (no stable key).

### Read path (the UX payoff)

Triggered during app startup, **before** `useAutoReconnect` fires `connect()`:

1. In `_layout.tsx` (or a new `useChatCacheHydration` hook): wait for `ServerConfigProvider.isHydrated`.
2. Pick the profile the way `useAutoReconnect.pickBestProfile` does (highest `lastConnectedAt`).
3. Read `documentDirectory/chatcache/<profileId>.enc`. If missing, skip.
4. Decrypt. If it fails, delete the file and skip.
5. Seed:
   - `useSessions.setCurrentSession(sessionKey)`.
   - `useChat.sessionCacheRef[sessionKey] = messages`.
   - Optionally set a `cameFromCache: true` flag so UI can show a subtle "showing cached view" hint if desired.
6. `useAutoReconnect` then connects as usual. When `sessions.list` returns, session list is replaced. When `chat.history` returns for the current session, messages are overwritten — server is authoritative.
7. Skeletons only render on genuine cache miss (fresh install, first time on this profile, decrypt failure).

### Lifecycle

- **`removeProfile(id)`** → delete `<id>.enc` file.
- **"Clear cached chats" Settings action (Phase 2)** → delete all `chatcache/*.enc` files.
- **5+ consecutive `auth_failed` errors for a profile** → delete that profile's cache file (token likely rotated, chat may belong to a different user now).
- **App uninstall** → iOS + Android both remove the sandbox, including SecureStore entry and files. No stray data.

### iOS backup + iCloud behavior

Chat cache files are **excluded from iCloud/iTunes backups** via `NSURLIsExcludedFromBackupKey`. Even though the file is encrypted, "the ciphertext isn't in backups either" is the right default — it removes an entire class of cross-device leakage scenarios.

In Expo this is done after creating the file using `FileSystem.setExcludedFromBackupAsync` (or the platform equivalent in SDK 55+).

---

## 5. Security analysis

### Threat model

| Attacker                                        | Plaintext (AsyncStorage) | Encrypted (Option B-lite) |
|-------------------------------------------------|--------------------------|---------------------------|
| App process, read-only public API               | Blocked                  | Blocked                   |
| Someone restoring user's iCloud/iTunes backup   | Reads chats              | Backup excludes file + ciphertext anyway |
| Crash reporter / analytics SDK scraping storage | Plaintext breadcrumbs    | Ciphertext only           |
| Physical device, locked, no passcode            | Keychain protects key → can't decrypt | Same, plus ciphertext is worthless |
| Jailbroken device, attacker runs as the app     | Reads plaintext directly | Reads Keychain entry when app foregrounds, decrypts. **Client-side encryption does not defend against this.** |

### Honest caveats

- Client-side encryption with a local key never defeats an attacker who already owns the device as root. What it does defeat is backup leakage, analytics pipelines, forensic recovery from wiped disks, and the "someone restored my phone onto a new one" scenario.
- SecureStore on iOS uses `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` by default. The key is not accessible before first unlock after boot. Good enough.
- The app's `.cursorrules` directive ("Never log, cache, or persist sensitive data in plaintext") is honored: the plaintext never touches disk; the on-disk form is always AES-GCM ciphertext.

### What is explicitly *not* cached

- The connection token (stays in SecureStore).
- Device identity private key (stays in SecureStore).
- Streaming-in-progress messages.

---

## 6. Work breakdown (concrete)

Four small commits, each independently shippable:

### Commit 1 — Crypto + store primitives
- New: `src/lib/chatCache/crypto.ts`
  - `getOrCreateCacheKey(): Promise<Uint8Array>` — read from / write to `expo-secure-store` key `clawboy-cache-key-v1`.
  - `encryptJSON<T>(key: Uint8Array, value: T): Promise<string>` — returns base64 of `iv || ciphertext || authTag`.
  - `decryptJSON<T>(key: Uint8Array, b64: string): Promise<T>`.
- New: `src/lib/chatCache/store.ts`
  - `readCache(profileId: string): Promise<CachedSessionBlob | null>`.
  - `writeCache(profileId: string, blob: CachedSessionBlob): Promise<void>` (atomic via tmp + rename, sets `NSURLIsExcludedFromBackupKey`).
  - `deleteCache(profileId: string): Promise<void>`.
  - `deleteAllCache(): Promise<void>`.
- New: `src/lib/chatCache/types.ts` — `CachedSessionBlob` shape.
- Tests: round-trip encrypt/decrypt, tampered ciphertext rejected, missing file returns null.

### Commit 2 — Write path
- New: `src/hooks/useChatCachePersistence.ts` — subscribes to `useChat` message finalization + `useSessions` current key, debounces 500ms, calls `writeCache`.
- Wire into `_layout.tsx` under the existing providers.
- Guard: skip when `sessionKey` is a local-only "main" session with no server key.

### Commit 3 — Read path (the UX win)
- New: `src/hooks/useChatCacheHydration.ts` — runs once on startup after `isHydrated`, before `useAutoReconnect` kicks in. Seeds `useChat.sessionCacheRef` + `useSessions.setCurrentSession`.
- Update `app/_layout.tsx` to call hydration hook before `useAutoReconnect` (or ensure it runs in the same effect pass).
- Update `MessageListSkeleton` trigger so skeletons only show on true cache miss.

### Commit 4 — Lifecycle
- `useServerConfig.removeProfile` → also `deleteCache(id)`.
- `useConnection` error handler: track per-profile `auth_failed` streak; on 5th consecutive, `deleteCache`.
- New Settings action: "Clear cached chats" → `deleteAllCache()`.
- Exclude file from iCloud backup after every write.

---

## 7. Open questions / decisions to confirm before building

1. **Cache tail size** — 20 messages is a default. Configurable later if needed. Confirm 20 is reasonable for the target viewport.
2. **Tool-call arg/result caching** — currently planned to cache everything inside the message (thinking, tool calls, images). Confirm: no filtering of "suspicious-looking" content. We rely on encryption, not heuristics.
3. **`cameFromCache` indicator in UI** — should we show the user that what they're seeing is the cached view, or is that noise? Default: no indicator. Banner already tells them we're reconnecting.
4. **Audio/video URL expiry** — if signed URLs expired since last write, image/audio may 404. Acceptable for v1; add "tap to refresh" later.

---

## 8. Full Option B design (SQLCipher) — preserved for future upgrade

> **This section captures the original, full-fat Option B design in its entirety.**
> It is not what we are shipping right now — see §4 for Option B-lite — but it
> documents the full design we will pick up if/when any of the trigger
> conditions below become roadmap items. Everything here was intentionally
> designed before the decision to scope down, and is preserved so that future
> implementation work starts with context, not a blank page.

### 8.1 Goal at full scope

Persist a bounded slice of chat history across app launches so that:

- Cold start hydrates instantly from the **last 10 sessions** the user touched on a given profile, with the **last 200 messages** of the session they'll resume.
- History is searchable, browsable offline, and content-addressable for features like bookmarks / "jump to previous tool output".
- All data on disk is encrypted at rest, including indices, with key material that never leaves the device's hardware-backed secure enclave.

### 8.2 Trigger conditions — when to upgrade from B-lite

Any **one** of these landing on the near-term roadmap should push us to ship the full design:

1. **Search across cached chats** (e.g. "find that bash command I ran last week") — requires indexed, queryable storage.
2. **Offline browsing of old sessions** — user can scroll history without a live connection; needs retention beyond the current session's tail.
3. **Content-level bookmarks / pinned messages** — not just session-level pins like today; requires per-message referents that survive sessions being trimmed.
4. **Cache budgets in the hundreds of MB** — needs eviction queries, not whole-file rewrites.

### 8.3 Storage engine comparison (why SQLCipher wins at scale)

Four realistic options were considered:

**A. AsyncStorage + hand-rolled AES-GCM encryption**

- One AES-256-GCM key generated on first launch, stored in SecureStore.
- Encrypt each session's JSON blob with that key, write ciphertext under a key like `chat-cache.<profileId>.<sessionKey>`.
- *Pros:* zero new dependencies; `expo-crypto` is already present.
- *Cons:* No querying. Showing the last N sessions requires loading every value in a prefix. AsyncStorage is a single mmap'd store — large caches cause whole-file rewrites. Crashes mid-write can corrupt entries. Would be a stepping stone, not an endpoint.

**B. `expo-file-system` + encrypted per-session files**

- Same SecureStore-held key as A.
- Each session is a file at `documentDirectory/chatcache/<profileId>/<sessionKey>.bin`, AES-GCM ciphertext.
- *Pros:* atomic per-session writes, easy to delete one profile's data, each file can be marked excluded from iCloud backup.
- *Cons:* still no indexing — "show me the 10 most recent sessions" requires reading a manifest file we maintain ourselves. Same dependency footprint as A.
- *Note:* this is the shape we chose for Option B-lite (§4), but scaled down to one file and one session.

**C. `expo-sqlite` with encryption (SQLCipher)** ← **chosen for full Option B**

- SDK 51+ exposes `openDatabaseAsync(name, { encryptionKey })` which wires to SQLCipher at the native layer.
- Schema: `sessions(profileId, sessionKey, lastMessageAt, titleHash, …)`, `messages(sessionKey, id, role, contentBlob, thinkingBlob, toolsBlob, createdAt)`.
- *Pros:* real queries ("top 10 sessions by updated_at for profileId X"), transactions, easy migration path to per-message features. All data is encrypted including indices. Survives OS eviction semantics better than free-form files.
- *Cons:* biggest dependency surface, schema migrations to own, native build impact. `expo-sqlite` is already part of the Expo SDK so adding it is a line in `package.json` — no prebuild surgery required.

**D. MMKV + encryption**

- Fast, but `react-native-mmkv`'s Hermes/bridgeless story on SDK 55 needs verification, and its historical encryption was XOR-style scrambling — a different threat model than AES-GCM.
- *Decision:* skip.

### 8.4 Recommendation (full scope)

**Option C (expo-sqlite with SQLCipher).** Reasons:

1. The features that force the upgrade (§8.2) all want per-message queries. SQL is the right shape.
2. Chat messages are already row-like (id, role, content, timestamp, tool calls). Shoehorning them into a KV store is a one-way ticket.
3. Encryption is transparent at the DB layer via SQLCipher — one key, one API, no per-row AES plumbing to debug.
4. `expo-sqlite` is first-party Expo, runs on iOS, Android, and web (WASM — caveats in §9).

### 8.5 Design

**Encryption key provisioning:**

- On first launch after install, generate 32 random bytes via `expo-crypto.getRandomBytesAsync(32)`.
- Store hex-encoded under `expo-secure-store` key `clawboy-db-key-v1`.
- Pass to `openDatabaseAsync` on every open. If key fetch fails (rare, device passcode cleared), nuke the DB file and start fresh — don't try to recover.

**Schema (v1):**

```sql
CREATE TABLE sessions (
  profile_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  title TEXT,
  last_message_at INTEGER NOT NULL,
  last_message_preview TEXT,
  agent_id TEXT,
  model_id TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, session_key)
);
CREATE INDEX idx_sessions_recent ON sessions (profile_id, last_message_at DESC);

CREATE TABLE messages (
  profile_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  thinking_json TEXT,
  tool_calls_json TEXT,
  images_json TEXT,
  audio_url TEXT,
  video_url TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, session_key, id)
);
CREATE INDEX idx_messages_session ON messages (profile_id, session_key, created_at);

CREATE TABLE schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Profile scoping in the primary key means switching servers is bulletproof — a query without `profile_id` returns nothing.

**Write path:**

- Add a `useChatCachePersistence` hook. Subscribes to `useChat`'s `sessionCacheRef` updates via a narrow interface — either a new `onCommittedMessage` callback in `useChat`, or a `useEffect` that diffs `messages` whenever `isStreaming === false`.
- Only persist messages where `isStreaming === false` and the session has a real server key (not a locally-created "main" session). This avoids writing half-streamed tokens on crash.
- Debounce writes per session (~250ms) so a burst of events becomes one `INSERT OR REPLACE`.
- Enforce caps in a single SQL:
  - Keep the last **10 sessions per profile**, last **200 messages per session**.
  - Run as a `DELETE … WHERE id NOT IN (SELECT id … ORDER BY … LIMIT N)` in the same transaction as the insert. Cheap and bounded.

**Read path (the UX win at full scope):**

- At app start, after `ServerConfigProvider` hydrates but *before* `useAutoReconnect` fires `connect()`:
  1. Look up the profile with the latest `lastConnectedAt`.
  2. `SELECT` the top 10 sessions for that profile → hydrate `useSessions` list (marking them as "from cache" so UI can indicate it if we want).
  3. `SELECT` the last 200 messages for the most-recent session → hydrate `useChat.sessionCacheRef[sessionKey]`, set `currentSessionKey`; skeletons disappear instantly.
- Then `useAutoReconnect` connects. When `sessions.list` returns, replace the cached session list. When `chat.history` returns for the current session, replace the cached messages.
- Reconciliation is a **straight overwrite, not a merge** — server is source of truth.

**Lifecycle hooks:**

- `removeProfile(id)` → `DELETE FROM sessions WHERE profile_id = ?` + same for messages, in one transaction.
- "Sign out" / app reset option in Settings → delete the DB file entirely + rotate the key in SecureStore.
- On **5+ consecutive `auth_failed` errors** for a profile → wipe that profile's cache (token likely rotated, chat contents may no longer belong to this user).

**iOS backup behavior:**

- After opening the DB, set `NSURLIsExcludedFromBackupKey = true` on the file. Ensures encrypted chats don't propagate via iCloud/iTunes backups. Cheap insurance — the data is already encrypted, but "the ciphertext isn't in backups either" is the right default.

**What we deliberately do *not* cache (even at full scope):**

- The connection token (stays in SecureStore; not in the DB).
- Streaming-in-progress messages.
- *We explicitly do cache tool-call JSON, thinking blocks, and images.* The risk of false-negative filtering ("oops, we thought that bash output looked safe") is higher than the risk of having it all in SQLCipher. Cache everything that makes the UX right; rely on encryption, not heuristics.
- Audio/video URLs that are signed/ephemeral **are** cached, but on cold read the UI checks if they look expired before rendering — fall back to "tap to reload" (Phase-2 detail).

### 8.6 Threat model at full scope

Identical to Option B-lite's model (see §5), plus:

- **Indices are also encrypted.** `idx_sessions_recent` and `idx_messages_session` live inside the SQLCipher DB file. A forensic pass on the raw disk still can't learn session ordering or count without the key.
- **SQLCipher crypto profile** — AES-256 in CBC mode with HMAC-SHA-256 for integrity (per-page MACs, key-derived via PBKDF2-SHA512 ×256,000 iterations by default in SQLCipher 4.x). Equivalent to or stronger than our hand-rolled AES-GCM in Option B-lite, and maintained by a specialist upstream.
- **Honest caveat unchanged:** client-side encryption cannot defend against an attacker who owns the device as root and can read the Keychain while the app is foregrounded. Same caveat as B-lite.

### 8.7 Work breakdown (at full scope)

Originally designed as four small commits, each independently reviewable:

1. **DB foundation** — add `expo-sqlite`, create `src/lib/db/` with `openDatabase`, schema migrations, key provisioning. No features wired up. Test with `expo-sqlite`'s test helpers + migration round-trip.
2. **Write path** — persist on `message`/`streamEnd`. Session rows upserted on `refreshSessions`. No reads yet; verify in Settings with a "Cache stats" debug row (bytes, rows).
3. **Read path** — cold-start hydration hook that seeds `useSessions` + `useChat` before `useAutoReconnect` kicks in. Skeleton only renders on genuine cache miss.
4. **Lifecycle** — profile delete, cache wipe on auth failures, backup-exclusion flag, Settings "Clear cached chats" action.

Each step is shippable on its own.

### 8.8 Upgrade steps from B-lite → full Option B

One-time migration when we pick this up:

1. Add `expo-sqlite` to `package.json`.
2. On first launch of the new version, detect `.enc` files in `documentDirectory/chatcache/`.
3. For each file: decrypt → `INSERT` rows into `sessions` + `messages` in a single transaction → delete the `.enc` file.
4. Reuse the same SecureStore-held key as the SQLCipher `encryptionKey`, or generate a new one and rotate (decision deferred — either is fine since the old and new blobs will exist side-by-side for exactly one app launch).
5. Apply caps immediately: keep the last 10 sessions per profile, last 200 messages per session. Enforced in the same transaction as writes going forward.

The migration is intentionally cheap because B-lite only carries ~20 messages for the most-recent session — there is very little data to move.

---

## 9. Cross-platform sync (related question, separate concern)

Design principle: **the local cache is never authoritative. The gateway is.**

This keeps sync trivial:

- **User settings (profiles, pinned sessions, theme, preferred model)** — local per device today. If users request sync, add `prefs.get` / `prefs.set` RPCs to the gateway; one-hook integration on our side. SecureStore-held tokens never leave the device. Intentional: phone-you and desktop-you probably want different pinned sessions.
- **Sessions + chat history** — already authoritative on the gateway. `sessions.list` + `chat.history` + `sessions.changed` events are the sync protocol. Our cache is strictly read-through for cold-start UX. Desktop/web clients each get their own cache (or none) and connect to the same gateway; no cross-device plumbing needed.
- **Device identity** — each install has its own Ed25519 keypair, paired independently under the same gateway account. This is correct and should not be "synced."

### Platform notes

- **Web** — `expo-sqlite` supports WASM, but SQLCipher is not always included. Plan: web clients skip the encrypted cache entirely, fetch `chat.history` fresh. Users don't expect offline chat on web.
- **Web + `expo-secure-store`** — falls back to `localStorage`, which is *not* sufficient for the gateway token. Treat it as session-only on web: in-memory, re-auth on tab reload. Phase 2 decision.
- **Desktop (Expo macOS/Windows, or an Electron shell)** — same APIs, same design, same cache file. Translates 1:1.

---

## 10. Implementation sequencing (when we pick this up)

- Commit 1 (crypto + store) — ~2–3 hours, all isolated, no integration risk.
- Commit 2 (write path) — ~2 hours; main risk is choosing the right debounce signal from `useChat`.
- Commit 3 (read path) — ~2–3 hours; main risk is ordering vs. `useAutoReconnect` — hydration must complete before `connect()` is called, but the `connect()` itself must not wait on hydration more than ~500ms. Timeout out and continue if hydration is slow.
- Commit 4 (lifecycle) — ~1–2 hours.

Total: about 1–1.5 days of focused work. No native module changes required.

---

## 11. Decision log

- **2026-04-22** — Went with Option B-lite (JSON file) over the full Option B SQLCipher design. Rationale: UX goal is narrow (bridge the 1–3s reconnect gap with the most recent session), and the four features that would justify SQLCipher (search, offline browse, content bookmarks, large cache budgets) are not currently on the near-term roadmap. The **full Option B design is preserved in §8** — schema, write/read paths at scale, caps, lifecycle, work breakdown, threat model, storage-engine comparison — so picking it up later starts from a complete spec rather than a blank page.
- **2026-04-22** — Confirmed no local→gateway sync of cached data. Gateway remains sole source of truth for sessions/history. Settings sync deferred to a future `prefs.*` RPC (§9).
