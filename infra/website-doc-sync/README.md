# Website legal / changelog sync

Edits on `main` to `CHANGELOG.md` or `docs/legal/*.md` trigger [`.github/workflows/dispatch-website-doc-sync.yml`](../.github/workflows/dispatch-website-doc-sync.yml), which sends `repository_dispatch` to `kjswalls/v0-sunday-softworks-website`. That repo’s **Sync ClawBoy docs** workflow copies files into `content/legal/clawboy/` and opens a PR.

## Secrets

| Repository | Secret | Purpose |
|------------|--------|---------|
| **clawboy-expo** | `WEBSITE_DISPATCH_TOKEN` | PAT able to `POST .../dispatches` on the website repo (classic: `repo` on `v0-sunday-softworks-website`). |
| **v0-sunday-softworks-website** | `CLAWBOY_REPO_READ_TOKEN` | PAT with **Contents: Read** on `kjswalls/clawboy-expo` so Actions can check out the requested ref. |

## Manual backfill

In the website repo: **Actions → Sync ClawBoy docs → Run workflow**, and set `clawboy_ref` to a branch name or full SHA.

## File mapping

| clawboy-expo | website (`content/legal/clawboy/`) |
|--------------|--------------------------------------|
| `CHANGELOG.md` | `changelog.md` |
| `docs/legal/privacy-policy.md` | `privacy.md` |
| `docs/legal/terms.md` | `terms.md` |
| `docs/legal/open-source-licenses.md` | `licenses.md` |
