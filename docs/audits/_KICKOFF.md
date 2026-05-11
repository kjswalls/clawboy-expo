# Audit Kickoff Guide

How to launch any audit wave using Cursor Cloud / Background Agents or the `/multitask` command.

---

## §1 — Pick a runtime

| | Cloud / Background Agents | `/multitask` |
|---|---|---|
| **How it starts** | One cloud agent per plan, each on its own branch | One parent chat spawns N local subagents |
| **Parallelism** | True parallel cloud execution | Parallel in your local Cursor instance |
| **Working tree** | Each agent gets its own sandbox + branch | All agents share your local working tree |
| **Walk-away friendly** | Yes — runs in the cloud while you're offline | Requires your machine to stay open |
| **Review flow** | Each agent opens a PR; merge in any order | Review local diffs after all agents finish |
| **Best for** | Unattended overnight runs, clean per-area PRs | Fast hands-on kick-off, watching progress live |

**When to use which:** use Cloud Agents when you want isolated, reviewable PRs per area and don't need to babysit. Use `/multitask` when you're at your machine and want the whole wave done in one shot with minimal setup.

---

## §2 — Reusable agent prompt

Copy this template and substitute `<filename>` and `<area>` before pasting:

```
You are running the audit plan at docs/audits/<filename>.md.
Read that file in full before touching anything.
Your allowed actions and forbidden actions are defined in docs/audits/_RULES.md.
Write your findings to docs/audits/findings/<area>-findings.md.
Update your status row in docs/audits/README.md from `todo` → `in_progress` when you
start, and to `done` when all exit criteria are met. Do not modify other rows, other
status cells, or any plan file.
```

### Substitution table

| `<filename>` | `<area>` (findings slug) |
|---|---|
| `05-input-slash-commands.md` | `05-input-slash-commands` |
| `06-sessions-sidebar.md` | `06-sessions-sidebar` |
| `07-agents-models-skills.md` | `07-agents-models-skills` |
| `08-onboarding.md` | `08-onboarding` |
| `10-voice-tts.md` | `10-voice-tts` |
| `11-media-attachments.md` | `11-media-attachments` |
| `12-annotations.md` | `12-annotations` |
| `15-achievements-badges.md` | `15-achievements-badges` |
| `16-demo-mode.md` | `16-demo-mode` |
| `18-feedback-worker.md` | `18-feedback-worker` |
| `19-conventions.md` | `19-conventions` |
| `20-theme-i18n-appearance.md` | `20-theme-i18n-appearance` |
| `21-native-module-pinned-ws.md` | `21-native-module-pinned-ws` |
| `22-ios-native-config.md` | `22-ios-native-config` |
| `23-supabase-migrations.md` | `23-supabase-migrations` |
| `X1-repo-hygiene-oss.md` | `X1-repo-hygiene-oss` |
| `X2-security-sweep.md` | `X2-security-sweep` |
| `X3-performance-sweep.md` | `X3-performance-sweep` |
| `X4-deps-and-licenses.md` | `X4-deps-and-licenses` |
| `X5-test-coverage.md` | `X5-test-coverage` |
| `X6-a11y-i18n.md` | `X6-a11y-i18n` |
| `X7-app-store-readiness.md` | `X7-app-store-readiness` |

---

## §3 — Runtime A: Cursor Cloud / Background Agents

1. Open Cursor and click the cloud/agent icon in the chat header, or press `Cmd+Shift+P` → **New Background Agent**.
2. For each plan in the wave, create a **new** agent with:
   - **Repository:** this repo (`clawboy-expo`)
   - **Branch:** a fresh branch named `audit/<area>` (e.g. `audit/05-input`, `audit/06-sessions`). One branch per agent — agents that share a branch will race on README edits.
   - **Model:** see the model column in the wave table below (Wave 2 is all Sonnet).
   - **Prompt:** the §2 template with `<filename>` and `<area>` filled in.
3. Submit all 8 agents. They run in parallel in the cloud.
4. Each agent will:
   - read its plan file and `_RULES.md`
   - walk the checklist from `_CHECKLIST.md`
   - write `docs/audits/findings/<area>-findings.md`
   - apply any auto-fixes allowed by `_RULES.md`
   - flip its row in `docs/audits/README.md` to `done`
   - commit all changes on its branch
5. When each agent finishes, review its PR and merge to `main` in any order (per-area rows are independent).

**Gotchas:**
- Branches must be unique per agent — two agents on the same branch will produce conflicting README edits.
- Do not kick off Wave 4 (`X1`–`X7`) until all Wave 1–3 branches are merged to `main`. Cross-cutting plans open and read the per-area findings files; if those files are still on unmerged branches, the X-plans will find nothing.

---

## §4 — Runtime B: `/multitask` in one chat

1. Open a **fresh** Cursor chat in this workspace. A clean context window keeps each subagent's working memory free of unrelated history.
2. Paste the prefilled Wave 2 block from §5 directly into the chat (no other preamble needed).
3. Send. Cursor spawns one subagent per task, all running in parallel inside your local instance.
4. Watch the subagent panels. Intervene only if one stalls or errors out.
5. When all subagents finish, run in the terminal:
   ```
   git status && npm test
   ```
   to confirm no agent left unstaged files or broke existing tests.

**Gotchas:**
- All `/multitask` subagents share your local working tree. Every agent will try to edit `docs/audits/README.md` (its own row only). The plans already instruct agents not to touch other rows, but emphasize this in the prompt to minimize merge conflicts. Git will handle non-overlapping line edits cleanly; you may need to resolve a conflict if two agents edit nearby lines simultaneously.
- If a subagent auto-fixes files in its scope, those edits land directly in your working tree. Review `git diff` when done.
- Do not run Wave 3 or Wave 4 as a `/multitask` batch in the same chat session — open a new chat for each wave to keep contexts isolated.

---

## §5 — Prefilled Wave 2 launch block

Copy this entire block and paste it into a **fresh** chat. It is ready to submit as-is for `/multitask`.

---

```
Run all 8 Wave 2 audit plans in parallel. For each task below:
- Read the plan file in full before touching any code.
- Your allowed and forbidden actions are in docs/audits/_RULES.md.
- Write findings to the path specified.
- Flip your row in docs/audits/README.md from `todo` → `in_progress` on start, then `done` on finish.
- Do NOT modify other rows or any plan file.

Task 1: Run audit plan docs/audits/05-input-slash-commands.md
Write findings to docs/audits/findings/05-input-slash-commands-findings.md

Task 2: Run audit plan docs/audits/06-sessions-sidebar.md
Write findings to docs/audits/findings/06-sessions-sidebar-findings.md

Task 3: Run audit plan docs/audits/07-agents-models-skills.md
Write findings to docs/audits/findings/07-agents-models-skills-findings.md

Task 4: Run audit plan docs/audits/08-onboarding.md
Write findings to docs/audits/findings/08-onboarding-findings.md

Task 5: Run audit plan docs/audits/10-voice-tts.md
Write findings to docs/audits/findings/10-voice-tts-findings.md

Task 6: Run audit plan docs/audits/11-media-attachments.md
Write findings to docs/audits/findings/11-media-attachments-findings.md

Task 7: Run audit plan docs/audits/12-annotations.md
Write findings to docs/audits/findings/12-annotations-findings.md

Task 8: Run audit plan docs/audits/15-achievements-badges.md
Write findings to docs/audits/findings/15-achievements-badges-findings.md
```

---

For Cloud / Background Agents, create 8 separate agents using the §2 template. Substitution values for Wave 2:

| Agent | Branch | `<filename>` | `<area>` | Model |
|---|---|---|---|---|
| 1 | `audit/05-input` | `05-input-slash-commands.md` | `05-input-slash-commands` | Sonnet |
| 2 | `audit/06-sessions` | `06-sessions-sidebar.md` | `06-sessions-sidebar` | Sonnet |
| 3 | `audit/07-agents` | `07-agents-models-skills.md` | `07-agents-models-skills` | Sonnet |
| 4 | `audit/08-onboarding` | `08-onboarding.md` | `08-onboarding` | Sonnet |
| 5 | `audit/10-voice` | `10-voice-tts.md` | `10-voice-tts` | Sonnet |
| 6 | `audit/11-media` | `11-media-attachments.md` | `11-media-attachments` | Sonnet |
| 7 | `audit/12-annotations` | `12-annotations.md` | `12-annotations` | Sonnet |
| 8 | `audit/15-achievements` | `15-achievements-badges.md` | `15-achievements-badges` | Sonnet |

---

## §6 — After the wave

Once all 8 agents report `done` (and branches are merged if you used Cloud Agents):

- [ ] All 8 rows in [docs/audits/README.md](README.md) show `done` under Wave 2
- [ ] 8 new findings files exist in [docs/audits/findings/](findings/)
- [ ] `npm test` passes at repo root
- [ ] (Cloud only) All 8 `audit/*` branches are merged to `main`
- [ ] Before starting Wave 3: no blockers — Wave 2 has no downstream dependencies within itself
- [ ] Before starting Wave 4 (`X1`–`X7`): all of Waves 1, 2, and 3 are `done` and merged

---

## §7 — Reusing this doc for other waves

### Wave 1 (already done)

Plans: `01`, `02`, `03`, `04`, `09`, `13`, `14`, `17`. Recorded as `done` in the README. No action needed.

### Wave 3

Plans: `16`, `18`, `19`, `20`, `21`, `22`, `23`. Same procedure as Wave 2. Swap in the Wave 3 plan list when building the §2 prompts or the §5 launch block.

Model notes for Wave 3: plans `22-ios-native-config` and `23-supabase-migrations` use **Opus** (high Apple-rules + RLS reasoning risk). Set model accordingly when creating those cloud agents or note it in the `/multitask` prompt.

### Wave 4 — SEQUENTIAL, not parallel

Plans: `X1` → `X2` → `X3` → `X4` → `X5` → `X6` → `X7`.

Wave 4 cross-cutting plans read the findings from all prior waves. They **must** run in dependency order, not in parallel.

- **Do not `/multitask` Wave 4.** Run one plan at a time.
- **Do not start Wave 4 until Waves 1–3 are fully merged to `main`.**
- For Cloud Agents: create one agent, wait for it to finish and merge, then create the next.
- For local: open one fresh chat per plan, in order, waiting for each to complete before opening the next.

Dependency order (from [docs/audits/README.md](README.md)):

```
X1 (all 01–23 done)
X2 (01, 02, 03, 13, 14, 17 done)
X3 (04, 05, 06, 11 done)
X4 (all 01–23 done)
X5 (all 01–23 done)
X6 (20 done)
X7 (X1, X2, X3, X4, X5, X6 done) ← final go/no-go
```

`X2` and `X7` use **Opus**. All others use Sonnet.
