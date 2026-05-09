# Audit Plan: Supabase Migrations & RLS

> **For the agent running this plan:** Read this entire file before touching any code.
> Your deliverable is `docs/audits/findings/23-supabase-migrations-findings.md`.
> **All SQL migration files are READ ONLY.** Do NOT modify any `.sql` file.
> Do NOT modify this plan file.

---

## 1. Scope

```
supabase/migrations/** (READ ONLY)
supabase/config.toml (READ ONLY)
infra/supabase/ (if present — edge functions or additional config)
```

## 2. Out of Scope

- `src/lib/supabase/` — covered in plan 14
- `infra/feedback-worker/` — covered in plan 18
- All other files
- `docs/audits/`
- `node_modules/`

## 3. Required Reading

1. [Supabase Row Level Security docs](https://supabase.com/docs/guides/auth/row-level-security)
2. `docs/plans/database-and-accounts.md` (if present) — DB design
3. `docs/audits/_CHECKLIST.md`
4. `docs/audits/_RULES.md`

> All findings are `proposed`. SQL migrations must not be modified — new migrations are the correct fix path and require human authoring.

## 4. Concern Checklist

### Correctness

- [ ] Every table has RLS enabled — list any table without RLS enabled as a critical finding
- [ ] RLS policies cover all four operations (SELECT, INSERT, UPDATE, DELETE) for each table, or explicitly document which are intentionally missing
- [ ] `auth.uid()` used correctly in policies — no `user_id = <hardcoded UUID>` patterns
- [ ] Policy conditions use indexed columns for performance
- [ ] Migration ordering: migrations apply cleanly in sequence — no dependency on a migration from a different branch
- [ ] No `DROP TABLE` or destructive operations without a compensating up-migration
- [ ] `server_pointers` table (or equivalent): policies allow users to read/write only their own rows
- [ ] No `SECURITY DEFINER` functions that bypass RLS unless explicitly justified

### Security

- [ ] **No table has RLS disabled in production** (flag `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` as critical)
- [ ] No permissive policy that allows any authenticated user to read all rows of a sensitive table
- [ ] No passwords, tokens, or secrets in migration SQL comments or data seeds
- [ ] `anon` role: verify it has the minimum permissions necessary — no read access to user data tables
- [ ] `service_role` functions: verify any `SECURITY DEFINER` function is justified and scoped
- [ ] No personal user data in seed data or example migration data

### Performance

- [ ] Foreign keys indexed
- [ ] Columns used in RLS policy `WHERE` clauses are indexed
- [ ] No full-table-scan policies on large tables

### OSS-Readiness

- [ ] No private user UUIDs, email addresses, or real data in migrations
- [ ] No internal project names or private schema details that would reveal infrastructure
- [ ] Migration file names follow a consistent convention

## 5. Deliverable

Write output to: `docs/audits/findings/23-supabase-migrations-findings.md`

Finding IDs: `db-NNN`.

Include a table: table name | RLS enabled | policies present | SELECT | INSERT | UPDATE | DELETE | notes.

All findings are `proposed` — do NOT modify any SQL files.

## 6. Exit Criteria

- [ ] `docs/audits/findings/23-supabase-migrations-findings.md` written
- [ ] RLS table audit present
- [ ] No SQL files modified
- [ ] Severity counts accurate
- [ ] Row 23 in `docs/audits/README.md` flipped to `done`
