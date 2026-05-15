# Website legal / changelog sync

Edits on `main` to `CHANGELOG.md` or `docs/legal/*.md` trigger [`.github/workflows/dispatch-website-doc-sync.yml`](../.github/workflows/dispatch-website-doc-sync.yml), which sends `repository_dispatch` to `kjswalls/v0-sunday-softworks-website`. That repo’s **Sync ClawBoy docs** workflow copies files into `content/legal/clawboy/` and opens a PR.

## Secrets

| Repository | Secret | Purpose |
|------------|--------|---------|
| **clawboy-expo** | `WEBSITE_DISPATCH_TOKEN` | PAT able to `POST .../dispatches` on the website repo (classic: `repo` on `v0-sunday-softworks-website`). |
| **v0-sunday-softworks-website** | `CLAWBOY_REPO_READ_TOKEN` | PAT with **Contents: Read** on `kjswalls/clawboy-expo` so Actions can check out the requested ref. |
| **v0-sunday-softworks-website** (optional) | `SYNC_PR_CREATE_TOKEN` | Only if `gh pr create` fails: classic PAT with `repo` on the **website** repo, used for opening the sync PR when `GITHUB_TOKEN` is not allowed to create PRs. |

### If the website workflow pushes a branch but PR creation fails

GitHub may block `GITHUB_TOKEN` from creating pull requests. Fix one of:

1. **Repository (preferred):** Website repo → **Settings** → **Actions** → **General** → **Workflow permissions** → select **Read and write permissions**, then enable **Allow GitHub Actions to create and approve pull requests**. Save.
2. **Organization:** If an org policy overrides the above, add **`SYNC_PR_CREATE_TOKEN`** on the website repo (classic PAT, `repo` scope, access to `v0-sunday-softworks-website` only). The workflow uses it only for `gh pr create`.

After a failed run, open a PR manually from the pushed branch link in the job log, or delete the orphan branch and re-run the workflow.

## Manual backfill

In the website repo: **Actions → Sync ClawBoy docs → Run workflow**, and set `clawboy_ref` to a branch name or full SHA.

## File mapping

| clawboy-expo | website (`content/legal/clawboy/`) |
|--------------|--------------------------------------|
| `CHANGELOG.md` | `changelog.md` |
| `docs/legal/privacy-policy.md` | `privacy.md` |
| `docs/legal/terms.md` | `terms.md` |
| `docs/legal/open-source-licenses.md` | `licenses.md` |
