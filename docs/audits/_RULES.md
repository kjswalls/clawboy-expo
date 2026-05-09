# Audit Agent Rules

These rules govern what an audit agent MAY and MAY NOT change. Every per-area and cross-cutting plan references this file.

---

## Allowed auto-fixes (apply freely)

An agent may make these changes without human sign-off:

- Formatting / whitespace inconsistencies (trailing spaces, blank-line discipline)
- Removing dead code: unreachable branches, unused variables, unused imports
- Removing unused exports that are demonstrably internal
- Obvious lint errors (TypeScript strict-mode violations, missing `return` types on internal helpers)
- Narrowing `any` to a concrete type where the concrete type is already obvious from surrounding code
- Removing `console.log` / `console.warn` / `console.info` calls that log non-error, non-critical data
- Fixing typos in comments, string literals, and identifier names (when no public API is affected)
- Tightening `useEffect` dependency arrays where adding the missing dep does **not** change behavior
- Replacing `AsyncStorage` usage for sensitive data with `expo-secure-store` (per `.cursorrules` Security §1)
- Removing redundant/narrative comments that only restate what the code already says
- Adding explicit `return` type annotations to hooks and utility functions where missing and unambiguous

## Proposed fixes (write to findings doc, do NOT apply)

These require the human to review and approve before application:

- Any change to public API shapes, hook return types, or exported type names
- Any behavioral change, however small, to streaming, reconnect, or backoff logic
- Any fix that requires adding a new dependency or upgrading an existing one
- Any fix that changes what data is stored or how it is stored
- Test additions beyond trivial snapshot refreshes (propose in findings, don't commit)
- Splitting a large file into multiple files (flag the candidate, propose the split, don't execute)
- Changing animation timing, easing, or visual output
- Any change to i18n key names or locale file structure

## Absolutely forbidden without explicit human sign-off

Do NOT touch these, even to "clean them up":

- `src/lib/openclaw/client.ts` — reconnect backoff, `_connectGeneration` counter, stream isolation logic
- `src/lib/device-identity.ts` — Ed25519 keypair generation, storage, signing flow
- `src/contexts/ConnectionContext.tsx` — auth state machine transitions
- `supabase/migrations/` — any SQL schema file
- `infra/` — Cloudflare Worker or Supabase edge function source (except doc fixes)
- Certificate / key material in `certs/` — read-only; flag, never edit
- `eas.json` build profiles — read-only; flag only
- Any file that would require a new native build to validate (`modules/`, `ios/`, `android/`)

## Meta-rules

1. If unsure whether a fix is allowed, write it as a proposed fix in the findings doc and do NOT apply it.
2. Every auto-fix applied must be listed in the **Auto-fixes applied** section of the findings doc with its finding ID, severity, and a one-line description of what changed.
3. Run `npm test` (scoped to the relevant Jest project) after applying any fixes and record the result in **Test impact**.
4. Do not modify any file outside the plan's declared scope.
5. Do not update other plans' findings docs.
6. Do not modify the plan files themselves (`docs/audits/*.md` plan files are read-only to audit agents).
7. Flip your row in `docs/audits/README.md` status table from `todo` → `done` when all exit criteria are met.
