---
name: openclaw-palette-styling
overview: Restyle `SlashCommandPalette` to match OpenClaw web (purple instead of red), add an args-picker mode that lists fixed option choices when a command like `/verbose` has multiple values, and surface `instant` / `N options` badges.
todos:
  - id: schema
    content: Add argOptions field + populate built-ins in src/components/input/slashCommands.ts
    status: pending
  - id: remote-options
    content: Pull argOptions from remote command choices in src/hooks/useCommands.tsx
    status: pending
  - id: palette-visual
    content: Restyle SlashCommandPalette rows (icons, badges, right-aligned desc, footer) using colors.primary
    status: pending
  - id: palette-args-mode
    content: Add args-picker mode rendering to SlashCommandPalette with header + option rows + footer
    status: pending
  - id: inputbar-wiring
    content: Detect args mode in InputBar and wire onSelectCommand / onSelectArg handlers
    status: pending
  - id: tests
    content: Add a small test verifying argOptions is set on verbose / fast / tts
    status: pending
isProject: false
---

## Goal

Match the OpenClaw web slash palette visuals (compact rows, accent-colored icons, right-aligned descriptions, `instant` / `N options` badges, kbd footer) using our purple accent — and add a second "args-picker" mode that lists fixed choices for commands like `/verbose on|off`.

## Reference

- Web styles: [/tmp/openclaw-shallow/ui/src/styles/chat/layout.css](/tmp/openclaw-shallow/ui/src/styles/chat/layout.css) lines 768–932.
- Web behavior + arg-mode rendering: `renderSlashMenu` in [/tmp/openclaw-shallow/ui/src/ui/views/chat.ts](/tmp/openclaw-shallow/ui/src/ui/views/chat.ts) lines 573–695.
- Local-arg choices source of truth: [/tmp/openclaw-shallow/src/auto-reply/commands-registry.shared.ts](/tmp/openclaw-shallow/src/auto-reply/commands-registry.shared.ts) (e.g. `/verbose` choices `["on","off"]` at line 734).

## Changes

### 1. `src/components/input/slashCommands.ts`

- Add `argOptions?: string[]` to [`SlashCommandItem`](src/components/input/slashCommands.ts).
- Populate `argOptions` for built-ins that have fixed choices in OpenClaw's registry:
  - `verbose: ["on","off"]`
  - `fast: ["status","on","off"]`
  - `tts: ["on","off"]` (web: `["on","off","inherit"]` — match web)
  - Add new built-ins (or update categories) only as needed: `tools` (`compact|verbose`), `session` (`idle|max-age`), `subagents` (`list|kill|log|info|send|steer|spawn`).
- Keep `parseSlashCommand` / `filterCommands` API the same (no behavior change to existing tests).

### 2. `src/hooks/useCommands.tsx`

In `entryToSlashCommand`, derive `argOptions` from the first arg's `choices` when present (mirroring web's `getArgOptions`):

```ts
const firstArg = entry.args?.[0];
const argOptions = firstArg?.choices
  ?.map((c) => (typeof c === 'string' ? c : c.value))
  .filter(Boolean);
```

### 3. `src/components/input/SlashCommandPalette.tsx`  (visual refresh)

Apply the OpenClaw look using `colors.primary` as the accent (purple `#A855F7`):

- Rows: drop the 32×32 rounded icon container; render the lucide icon at 14px directly with `color: colors.primary` and `opacity: 0.7` (→ `1` when active).
- Layout per row: `[icon] /name (mono, primary) <args (muted)>  …  description (right-aligned, muted)  [badge]`.
- Section header label: `colors.primary`, opacity 0.7, uppercase, letter-spacing 0.06em.
- Selected state: background `primary @ ~12% alpha` (e.g. `colors.primary + '1F'`), name color `colors.foreground`, desc `colors.foreground`.
- Card: keep `BlurView` but switch border to `colors.border`, inner padding 6px, max-height 320, `BorderRadius.lg`.
- Badges (new) at row-end:
  - `instant` — when `command.executeLocal && !command.args`.
  - `N options` — when `command.argOptions?.length > 0`.
  - Style: small pill, `bg = primary @ 12% alpha`, `color = primary`, `fontSize: 11`, `fontWeight: 600`.
- Footer (new) at bottom of card:
  - Command mode: `↑↓ navigate · Tab fill · Enter select · Esc close`
  - Args mode: `↑↓ navigate · Tab fill · Enter run · Esc close`
  - Each shortcut wrapped in a `<View>` styled like a `kbd` (1px border, monospace, 11px). Shown for visual parity even though there's no hardware keyboard on iPhone.

### 4. New args-picker mode in `SlashCommandPalette.tsx`

Extend props to support two modes:

```ts
type PaletteMode =
  | { kind: 'commands'; commands: SlashCommandItem[]; selectedIndex: number;
      onSelect: (cmd: SlashCommandItem) => void; }
  | { kind: 'args'; command: SlashCommandItem; options: string[]; selectedIndex: number;
      onSelect: (option: string) => void; };
```

Args-mode render (mirrors web):

- Header row: `/${command.name}` in primary + ` ${command.description.toUpperCase()}` in primary @ ~80% opacity, separated by a thin border-bottom.
- Each option row: terminal/prompt icon (use `Terminal` from lucide), option label in foreground, right-aligned `/${command.name} ${option}` in muted.

### 5. `src/components/input/InputBar.tsx` — wiring

Replace the simple `showCommands = value.startsWith('/')` block with a small derivation matching web's `updateSlashMenu`:

```ts
const argMatch = value.match(/^\/(\S+)\s(.*)$/u);
const cmdMatch = !argMatch && value.match(/^\/(\S*)$/u);

let palette:
  | { kind: 'commands'; items: SlashCommandItem[] }
  | { kind: 'args'; cmd: SlashCommandItem; options: string[] }
  | null = null;

if (argMatch) {
  const cmd = commands.find((c) => c.name === argMatch[1].toLowerCase());
  if (cmd?.argOptions?.length) {
    const filtered = argMatch[2]
      ? cmd.argOptions.filter((o) => o.toLowerCase().startsWith(argMatch[2].toLowerCase()))
      : cmd.argOptions;
    if (filtered.length) palette = { kind: 'args', cmd, options: filtered };
  }
} else if (cmdMatch) {
  const items = filterCommands(commands, cmdMatch[1], { showPower: cmdMatch[1].length > 0 });
  if (items.length) palette = { kind: 'commands', items };
}
```

Selection handlers:

- `onSelectCommand(cmd)`:
  - If `cmd.argOptions?.length`: set draft to `/${cmd.name} ` (transitions palette into args mode).
  - Else if `cmd.executeLocal && !cmd.args`: set draft + call `handleSend()` (instant execution).
  - Else: keep current behavior (`/${cmd.name} `).
- `onSelectArg(option)`: set draft to `/${cmd.name} ${option}` and call `handleSend()` (matches web mouse-click → execute).

Reset `selectedCommandIndex` when palette `kind` or item count changes.

## Out of scope

- Hardware keyboard handling (Tab/Enter/Esc) — footer is decorative for now; can add later for iPad.
- Changing `BUILTIN_SLASH_COMMANDS` tier ordering or `parseSlashCommand` semantics.

## Tests

Add a small `argOptions` test in [src/components/input/__tests__/filterCommands.test.ts](src/components/input/__tests__/filterCommands.test.ts) to verify the new field is present on `verbose`, `fast`, `tts`. Existing snapshot tests under [src/components/chat/__tests__/](src/components/chat/__tests__/) are unaffected (palette has no snapshot test today).
