# @ mentions vs `/` slash commands

Design notes for ClawBoy input affordances. **`/`** is already the imperative channel (built-in OpenClaw slash commands, local vs gateway execution, palette in `src/components/input/slashCommands.ts`). **`@`** should mean “refer to or attach something,” not a second command language.

## Recommended split

| Prefix | Mental model | Fit in ClawBoy |
|--------|----------------|----------------|
| **`/`** | Do something (app or gateway) | Current scope: `/new`, `/model`, steer, reset, remote commands, etc. |
| **`@`** | Point at something (context, entity, file) | References and attachments—not duplicate “commands” |

## Strong `@` uses

1. **Context and references (primary)**  
   - **`@agent`**, **`@model`**, **`@session`**, or a single **`@`** picker listing those—in the draft, same outcome as header pickers but faster for power users.  
   - Later: **`@skill`** / **`@tool`** only if the gateway exposes stable IDs and the client validates before send.

2. **Files / media**  
   - **`@image`**, **`@file`**, or one **`@`** flow opening the system picker; structured tokens the client maps to gateway-safe attachments (see attachment prep in `src/lib/attachments/`).

3. **Lightweight context snippets**  
   - **`@clipboard`**—paste as a quoted block with explicit user confirmation (clipboard is sensitive).  
   - Saved snippets / **`@note`**—only for non-sensitive prefs; never secrets.

## Weaker or redundant uses

- **Custom `@` “commands”** that mirror **`/`**—splits the mental model and doubles maintenance; gateway verbs stay on **`/`**.  
- **Arbitrary `@foo` as RPC**—avoid unless strictly allowlisted and validated (see `.cursorrules` security section).

## Optional product stance

Defer **`@`** until **`/`** and attachment UX feel complete, then add **`@`** only for **references + files**—aligned with patterns users know from Slack, Discord, Notion AI, etc.

## Summary

Use **`@`** for **context, references, and file/image insertion**. Keep **custom and gateway behavior on `/`**.
