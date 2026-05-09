# Audit Kickoff Guide

How to launch the pre-release audit plans as Cursor Background Agents (or local in-IDE chats). Read `docs/audits/README.md` first for the wave schedule and model recommendations.

---

## Pre-Flight Checklist

Before fanning out any agents:

- **Clean working tree** — commit or stash all uncommitted changes (`git status` should be clean). Agents write findings and auto-fixes; a dirty tree makes diffs hard to review.
- **Cursor plan tier** — Background Agents require Cursor Pro or higher. Verify your plan at [cursor.com/settings](https://cursor.com/settings).
- **Monitor quota** — open [cursor.com/settings/usage](https://cursor.com/settings/usage) in a browser tab before starting. Each agent run burns model tokens from your quota; 8 parallel Opus agents burn fast.
- **Decide your wave** — start with Wave 1. Do not launch Wave 4 cross-cutting plans until the per-area plans they depend on are `done`.
- **Pick model per plan** — use the Model Recommendations table in `docs/audits/README.md`. Default: Sonnet for most, Opus for the 7 high-stakes plans.
- **Verify `docs/audits/findings/` exists** — it should already contain `.gitkeep`. Agents write their output there.

---

## Reusable Kickoff Prompt

Copy this, fill in the three placeholders, and paste it as the first message to each agent.

```
You are running audit plan `docs/audits/<PLAN_FILENAME>`.

Read that file in full before touching anything. Your allowed and forbidden
actions are defined in `docs/audits/_RULES.md`. The standard concern checklist
is in `docs/audits/_CHECKLIST.md`.

Deliverable: write `docs/audits/findings/<AREA>-findings.md` using the structure
in `docs/audits/_TEMPLATE.md` section 5.

When finished:
1. Apply only the auto-fixes permitted by your plan's exit criteria and `_RULES.md`.
2. Log every auto-fix in the findings doc (Auto-fixes applied section).
3. Run `npm test` (or the project subset specified in your plan's exit criteria).
4. Update your row in `docs/audits/README.md` status table from `todo` to `done`.

Do NOT modify any file outside your plan's declared scope.
Do NOT modify the plan file itself.
Do NOT modify other plans' findings files.

Model in use: <MODEL_NAME>  (record this in the findings front matter)
```

**Placeholder reference:**


| Placeholder       | Example                                |
| ----------------- | -------------------------------------- |
| `<PLAN_FILENAME>` | `01-gateway-protocol.md`               |
| `<AREA>`          | `01-gateway-protocol`                  |
| `<MODEL_NAME>`    | `claude-opus-4` or `claude-sonnet-4-5` |


---

## Option A: Cursor Background Agents (cloud, recommended for waves 1–3)

Background Agents run in an isolated cloud VM on their own branch. Best for running 4–8 agents in parallel without consuming local resources.

### Steps

1. **Ensure a clean main branch:**
  ```bash
   git status        # must be clean
   git pull          # latest remote state
  ```
2. **Open Cursor's Background Agent panel:**
  - Click the Background Agent icon in the sidebar, or
  - Press `Cmd+E` and select "Background Agent"
3. **For each plan in the wave, create one Background Agent:**
  - **Branch name:** `audit/<NN-area>` — e.g. `audit/01-gateway-protocol`
  - **Model:** per the Model Recommendations table
  - **Prompt:** the kickoff prompt above, with all three placeholders filled in
4. **Launch all agents in the wave** (8 for Wave 1, 8 for Wave 2, 7 for Wave 3).
5. **Wait for completion notifications.** Cursor notifies you when each agent finishes. You do not need to monitor them continuously.
6. **Review each completed agent:**
  - Open its branch: `git fetch && git checkout audit/<NN-area>`
  - Read `docs/audits/findings/<area>-findings.md` — this is the agent's full output
  - Review the diff of any auto-fixed source files: `git diff main`
  - If acceptable: merge the branch (or open a PR for team review)
  - If not acceptable: reject the auto-fixes, keep only the findings doc
7. **After all agents in the wave are merged:** start the next wave.

### Wave 4 (X-plans) with Background Agents

Run X-plans one at a time — each needs the prior one's findings:

```
X1 → wait for merge → X2 → wait for merge → X3 → X4 → X5 → X6 → X7
```

Each X-plan agent reads `docs/audits/findings/*.md` from the merged main branch, so merge before starting the next one.

---

## Option B: In-IDE Chat (local, recommended for wave 4 and single plans)

Best for serial runs where you want to watch the agent work and intervene.

### Steps

1. Open a **new Cursor chat** (not a continuation of this chat).
2. **Attach the plan file** by typing `@docs/audits/<PLAN_FILENAME>` or dragging the file into the chat.
3. **Paste the kickoff prompt** (filled in) as your first message.
4. The agent reads the plan, runs the checklist, writes findings, applies auto-fixes, and updates the README row — all inline in the chat.
5. Review changes in the diff panel as they appear. Accept or reject individual edits.
6. When the agent marks its row `done`, close the chat and open the next plan in a fresh chat.

### Using the plan "Run" button

If the plan is shown in Cursor's Plan panel:

1. Open `docs/audits/<PLAN_FILENAME>` in the editor.
2. Right-click the plan → "Run plan in new agent".
3. The agent launches automatically with the plan as context.
4. Still paste the kickoff prompt to ensure the agent records the model name and follows all `_RULES.md` constraints.

---

## Coordinating Concurrent Agents

When running multiple agents in parallel, they each write to their own namespaced findings file — no file-level conflicts. The only shared file is `docs/audits/README.md` (the status table).

**Recommended approach:** tell agents NOT to update the README mid-run if you are running many agents in parallel. Instead, have each agent include the status update in its findings doc header (`Status: done`), and you flip the README rows manually after merging each branch. This avoids merge conflicts in the status table.

If you do want agents to update the README automatically, ensure each agent does a `git pull --rebase` before its final commit so it picks up any row updates from concurrently-merged branches.

Finding ID namespacing prevents cross-plan collisions:


| Plan                   | Finding ID prefix |
| ---------------------- | ----------------- |
| 01-gateway-protocol    | `gateway-NNN`     |
| 02-auth-pairing        | `auth-NNN`        |
| 03-server-profiles     | `profiles-NNN`    |
| …                      | …                 |
| X2-security-sweep      | `sec-NNN`         |
| X7-app-store-readiness | `appstore-NNN`    |


---

## Cost Notes

- **Background Agents are included in paid Cursor plans** (Pro / Business / Ultra). Cloud VM compute does not cost extra.
- **Model tokens are metered** — each agent run counts against your plan's monthly token quota the same as an in-IDE chat.
- **Rough estimate for one full run of all 30 plans on Sonnet:** varies widely by codebase size and how many auto-fixes are needed; budget for a large multi-hour session worth of tokens.
- **Opus is ~5x more expensive per token than Sonnet.** The 7 Opus-tier plans will each cost significantly more than a Sonnet run. Monitor usage at [cursor.com/settings/usage](https://cursor.com/settings/usage).
- **Quota tip:** run Wave 1 first, check usage consumed, then extrapolate before committing to Waves 2–3.
- Official pricing and quota details: [cursor.com/pricing](https://cursor.com/pricing) and [docs.cursor.com](https://docs.cursor.com/).

---

## Quick-Reference: Wave 1 Kickoff (copy-paste ready)

Replace `<MODEL>` with `claude-opus-4` or `claude-sonnet-4-5` per the table. Create one Background Agent per row, each on its own branch.


| Branch                      | Plan file                | Model  | Area token            |
| --------------------------- | ------------------------ | ------ | --------------------- |
| `audit/01-gateway-protocol` | `01-gateway-protocol.md` | Opus   | `01-gateway-protocol` |
| `audit/02-auth-pairing`     | `02-auth-pairing.md`     | Opus   | `02-auth-pairing`     |
| `audit/03-server-profiles`  | `03-server-profiles.md`  | Sonnet | `03-server-profiles`  |
| `audit/04-chat-streaming`   | `04-chat-streaming.md`   | Sonnet | `04-chat-streaming`   |
| `audit/09-settings`         | `09-settings.md`         | Sonnet | `09-settings`         |
| `audit/13-purchases-iap`    | `13-purchases-iap.md`    | Opus   | `13-purchases-iap`    |
| `audit/14-account-supabase` | `14-account-supabase.md` | Sonnet | `14-account-supabase` |
| `audit/17-ota-updates`      | `17-ota-updates.md`      | Sonnet | `17-ota-updates`      |


Prompt for each (fill in `<PLAN_FILENAME>`, `<AREA>`, `<MODEL_NAME>`):

```
You are running audit plan `docs/audits/<PLAN_FILENAME>`.

Read that file in full before touching anything. Your allowed and forbidden
actions are defined in `docs/audits/_RULES.md`. The standard concern checklist
is in `docs/audits/_CHECKLIST.md`.

Deliverable: write `docs/audits/findings/<AREA>-findings.md` using the structure
in `docs/audits/_TEMPLATE.md` section 5.

When finished:
1. Apply only the auto-fixes permitted by your plan's exit criteria and `_RULES.md`.
2. Log every auto-fix in the findings doc (Auto-fixes applied section).
3. Run `npm test` (or the project subset specified in your plan's exit criteria).
4. Update your row in `docs/audits/README.md` status table from `todo` to `done`.

Do NOT modify any file outside your plan's declared scope.
Do NOT modify the plan file itself.
Do NOT modify other plans' findings files.

Model in use: <MODEL_NAME>  (record this in the findings front matter)
```

