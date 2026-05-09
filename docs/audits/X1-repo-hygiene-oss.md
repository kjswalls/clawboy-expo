# Cross-Cutting Plan: Repo Hygiene & OSS Preparation

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/X1-repo-hygiene-oss-findings.md` plus safe auto-fixes.
> Do NOT modify source logic files — only config, root docs, and `.gitignore` are in scope for edits.
> Do NOT modify this plan file.

**Run after:** All per-area plans 01–23 are `done` (read their findings for context on flagged issues).

---

## 1. Scope

```
.gitignore
package.json
package-lock.json
app.json
README.md (root — may not exist yet)
CHANGELOG.md
LICENSE (may not exist yet)
CONTRIBUTING.md (may not exist yet)
SECURITY.md (may not exist yet)
CODE_OF_CONDUCT.md (may not exist yet)
.github/**
scripts/**
certs/ (READ ONLY — analyze only)
docs/ (READ ONLY — reference only)
src/ (READ ONLY — scan only, no edits)
infra/ (READ ONLY — scan only, no edits)
```

## 2. Out of Scope

- `node_modules/`
- `ios/` — covered in plan 22
- `reference/` — should be gitignored; verify, do not read contents
- Any source logic file (`.ts`, `.tsx`) — OSS text scanning only, no code edits

## 3. Required Reading

1. `.cursorrules` — OSS-readiness requirements throughout
2. All findings docs in `docs/audits/findings/` — review flagged OSS issues from per-area audits
3. `docs/audits/_RULES.md`

## 4. Checklist

### .gitignore Audit

- [ ] `node_modules/` excluded
- [ ] `.expo/` excluded
- [ ] `dist/`, `web-build/` excluded
- [ ] `*.pem`, `*.key`, `*.p12`, `*.p8`, `*.mobileprovision` excluded
- [ ] `certs/private-key.pem` explicitly excluded
- [ ] `.env`, `.env.local`, `.env*.local` excluded
- [ ] `reference/` excluded (gitignored v0 reference)
- [ ] `ios/`, `android/` excluded (generated native — already in .gitignore; confirm)
- [ ] `.DS_Store` excluded
- [ ] `supabase/.temp/` excluded
- [ ] Cursor IDE log files excluded (`.cursor/**/*.log`)

### Git History Secrets Scan

- [ ] Run: `git log --all --full-history -- certs/private-key.pem` — must show no commits
- [ ] Run: `git log --all --full-history -- .env .env.local` — must show no commits
- [ ] Scan for high-entropy strings in recent commit history (use `rg` on tracked files, not git history — flag only, do NOT run `git-filter-repo` without human approval)
- [ ] `git log --oneline -20` — check recent commit messages for accidental sensitive data references

### Secrets & Private Data Scan (source files)

Run `rg` across all tracked non-node_modules source for:
- [ ] Private IP addresses: `rg "192\.168\." "10\." "172\.(1[6-9]|2[0-9]|3[01])\."` — flag any
- [ ] Tailscale magic-DNS: `rg "\.ts\.net"` — flag any hard-coded
- [ ] ngrok URLs: `rg "ngrok\.io"` — flag any
- [ ] localhost URLs: `rg "localhost"` — flag any in non-test, non-script files
- [ ] Supabase service role key pattern: `rg "service_role"` — flag any in source (not migrations or docs)
- [ ] RevenueCat API key pattern: `rg "appl_|goog_"` — flag any hard-coded
- [ ] Bearer token patterns: `rg "Bearer [A-Za-z0-9+/]{20,}"` — flag any
- [ ] Hard-coded UUIDs that look like user/account IDs — flag any

### TODO / FIXME Triage

- [ ] Run `rg "TODO|FIXME|XXX|HACK|BUG" --type ts --type tsx` across all source
- [ ] For each hit: classify as (a) safe-to-make-public, (b) contains private context → must be reworded, (c) actionable bug → add to findings
- [ ] Remove or sanitize any `TODO(name)` with private team member names

### OSS Documentation

Assess and note which documents are missing; propose content for each (do NOT create opinionated content without facts — keep it accurate):

- [ ] **`LICENSE`**: determine correct license (check `.cursorrules` or ask human if unknown); create if missing
- [ ] **`README.md`** (root): assess current state; must describe project, setup, and connect-to-gateway instructions for public audience; no internal infra references
- [ ] **`CONTRIBUTING.md`**: basic contribution guide — code style, PR process, test requirement; create if missing
- [ ] **`SECURITY.md`**: responsible disclosure policy — how to report vulnerabilities; create if missing (use GitHub security advisory template)
- [ ] **`CODE_OF_CONDUCT.md`**: Contributor Covenant or similar; create if missing

### Third-Party Attribution

- [ ] Run `npx license-checker --summary` (or install if not present) — list all npm package licenses
- [ ] Flag any licenses that are incompatible with the intended OSS license (GPL, AGPL, proprietary)
- [ ] Check `ios/Podfile.lock` for native pod licenses — flag any restrictive ones
- [ ] Propose `THIRD_PARTY_LICENSES.md` if attribution is required

### Reference Folder

- [ ] Confirm `reference/` is in `.gitignore` and not tracked: `git ls-files reference/` must return nothing
- [ ] If any reference files are tracked, flag as high severity

### Debug Log Cleanup

- [ ] Scan for `console.log` calls that are not in `__DEV__` guards and not error-level: `rg "console\.(log|info|debug)" src/`
- [ ] Auto-remove any that log trivial/non-critical data (per `_RULES.md` allowed auto-fixes)
- [ ] Flag any that log user data, tokens, or PII — mark as `high` severity

## 5. Deliverable

Write output to: `docs/audits/findings/X1-repo-hygiene-oss-findings.md`

Finding IDs: `oss-NNN`.

Include sections:
- Gitignore status
- Git history secrets scan result
- Secrets/private data scan results (table: pattern | file | verdict)
- TODO/FIXME triage table
- OSS docs status table (doc | exists | adequate | action)
- License compatibility table
- Reference folder status

## 6. Exit Criteria

- [ ] `docs/audits/findings/X1-repo-hygiene-oss-findings.md` written with all sections
- [ ] Git history private-key check completed and documented
- [ ] No private data found in source (or all instances flagged as critical)
- [ ] OSS docs inventory complete
- [ ] Any auto-removed `console.log` calls listed
- [ ] Row X1 in `docs/audits/README.md` flipped to `done`
