/**
 * ClawBoy convention-injection helpers.
 *
 * Two delivery paths share one source-of-truth convention text:
 *
 *  1. Primary — per-session HTML-comment primer. ClawBoy prepends an invisible
 *     `<!-- clawboy:client-context ... -->` block to the gateway-bound content
 *     of the first user message in each session and refreshes on
 *     reset/compaction/reconnect. Other clients never see this block; the agent
 *     reads it as part of the user message. See {@link buildClientContextDirective},
 *     {@link stripClientContextDirective}.
 *
 *  2. Opt-in — `AGENTS.md` install. For users who want the convention to
 *     persist across compaction and devices without re-priming, we append a
 *     managed section between marker comments. The OpenClaw runtime injects
 *     `AGENTS.md` into every agent prompt (including non-ClawBoy sessions),
 *     so this path adds token cost on turns from other clients. Enable via
 *     Settings → ClawBoy Conventions. See {@link buildAgentsMdSection},
 *     {@link stripAgentsMdSection}.
 *
 * HTML comments are stripped by every standard markdown renderer
 * (markdown-it, the OpenClaw web UI, Discord/Telegram/Slack bridges), so
 * cross-client conversations only ever surface the user's prose.
 */

/** Bumped when the convention text changes; triggers reinstall on next visit. */
export const CONVENTION_VERSION = 5;

/** Open marker for the ClawBoy-managed section inside `AGENTS.md`. */
export const AGENTS_MD_START = `<!-- clawboy:managed-start v${CONVENTION_VERSION} -->`;

/** Close marker. The `v` is intentionally omitted from the close marker so
 *  legacy versions are still removed cleanly during uninstall/replace. */
export const AGENTS_MD_END = '<!-- clawboy:managed-end -->';

/**
 * Convention text shared by both delivery paths.
 *
 * The embedded example uses `{OPEN}` / `{CLOSE}` placeholders instead of
 * literal `<!--` / `-->` characters. This prevents two problems:
 *
 *   1. A model copying the example verbatim would emit invalid syntax and
 *      the parser would miss the directive.
 *   2. A literal `-->` inside the convention body would prematurely close the
 *      per-session primer comment that wraps it.
 *
 * The substitution instructions in the body are explicit and call out the
 * common `<--` (three-char) mistake observed in practice.
 */
export const CLAWBOY_CONVENTION_TEXT = `## ClawBoy iOS Client

**Interactive cards are the primary way to ask the user questions in ClawBoy.** Use a card for every confirmation, picker, or multi-step setup — not plain-prose questions. Cards render as tappable UI in ClawBoy and degrade to readable text in other clients.

Append a hidden HTML comment after your prose. \`{OPEN}\`/\`{CLOSE}\` are placeholders (see Substitute below).

### Single question
{OPEN} clawboy:options
{"choices":[{"label":"Yes","value":"Yes please"},{"label":"No","value":"No thanks"}]}
{CLOSE}

### Multiple questions (paginated card — user answers all, sends once)
{OPEN} clawboy:options
{"questions":[
  {"id":"agentId","prompt":"Agent id?","choices":[{"label":"twinkle","value":"twinkle"},{"label":"glow","value":"glow"}],"allowFreeText":true,"freeTextPlaceholder":"Or a custom name…"},
  {"id":"workspaceDir","prompt":"Workspace dir?","choices":[{"label":"Match id","value":"match"},{"label":"Custom","value":"custom"}]},
  {"id":"userMd","prompt":"USER.md stub or blank?","choices":[{"label":"Blank","value":"blank"},{"label":"Stub","value":"stub"}]}
]}
{CLOSE}

### Reading replies
{OPEN} clawboy:answers
{"agentId":"twinkle","workspaceDir":"match","userMd":null}
{CLOSE}
1. Agent id?: twinkle
2. Workspace dir?: match
3. USER.md stub or blank?: (skipped)

Keys match your \`id\`s. \`null\` = skipped. The numbered list is what other clients see.

### Substitute character-for-character
- \`{OPEN}\` → \`<\` \`!\` \`-\` \`-\` (FOUR chars — never bangless \`<--\`)
- \`{CLOSE}\` → \`-\` \`-\` \`>\`

### Rules
- Prose first, directive last.
- \`label\` = button text. \`value\` = sent back verbatim — make it standalone-readable.
- \`id\` = stable camelCase slug, returned as the answer key.
- \`allowFreeText\` defaults true; set false to force a button choice.
- JSON only — no trailing commas, no markdown inside.

Use for: every yes/no, confirmation, picker, setup step. Avoid for: open-ended brainstorming, >5 choices, final summaries.
`;

// ---------------------------------------------------------------------------
// AGENTS.md install path
// ---------------------------------------------------------------------------

/**
 * Render the full managed section that gets written into `AGENTS.md`.
 *
 * Includes the marker comments, a one-line note pointing at ClawBoy as the
 * owner, and the convention body. Bookended by blank lines so neighbouring
 * user content isn't visually crammed.
 */
export function buildAgentsMdSection(): string {
  return [
    AGENTS_MD_START,
    '<!-- This block is managed by ClawBoy (https://clawboy.app). Edit outside the markers — anything inside will be replaced on the next install/update. -->',
    '',
    CLAWBOY_CONVENTION_TEXT,
    AGENTS_MD_END,
  ].join('\n');
}

// Matches the entire managed block, including its trailing newline if any.
// Lazy on the body, multi-line via [\s\S]. Uses a non-anchored `<!--
// clawboy:managed-start` prefix so older marker versions (e.g. v0) are still
// removed cleanly during uninstall.
const MANAGED_BLOCK_RE = /<!--\s*clawboy:managed-start[^>]*-->[\s\S]*?<!--\s*clawboy:managed-end\s*-->\n?/g;

/**
 * Remove every ClawBoy-managed block from an `AGENTS.md` content string.
 *
 * Idempotent: running on text that has no managed block returns the input
 * unchanged. Used during uninstall and as the first step of a replace
 * (so duplicate blocks accidentally inserted by the user collapse to one).
 */
export function stripAgentsMdSection(content: string): string {
  if (!content || !content.includes('clawboy:managed-')) return content;
  return content.replace(MANAGED_BLOCK_RE, '');
}

// ---------------------------------------------------------------------------
// Per-session primer path
// ---------------------------------------------------------------------------

/** Open tag for the per-session primer comment. */
const PRIMER_START = `<!-- clawboy:client-context v${CONVENTION_VERSION}`;

/** Close tag. Same value-shape as the directive marker so we strip cleanly. */
const PRIMER_END = '-->';

/**
 * Build the hidden HTML-comment primer that wraps the convention text for
 * the per-session fallback path.
 *
 * Output is a single comment block, multi-line, with the convention body
 * inside it. Markdown renderers strip the entire block; the agent reads it
 * as part of the user message (because the OpenClaw protocol does not split
 * on comments).
 */
export function buildClientContextDirective(): string {
  return [
    PRIMER_START,
    CLAWBOY_CONVENTION_TEXT.trimEnd(),
    PRIMER_END,
  ].join('\n');
}

// Matches every primer block (case-insensitive, lazy multi-line).
const PRIMER_RE = /<!--\s*clawboy:client-context[^>]*[\s\S]*?-->\n*/gi;

/**
 * Strip every ClawBoy primer comment from a text body.
 *
 * Used defensively in `openClawMessageToChat` so primer comments never leak
 * into copy/TTS/retry-quote flows even though they are already invisible in
 * markdown rendering. Idempotent.
 */
export function stripClientContextDirective(text: string): string {
  if (!text || !text.toLowerCase().includes('clawboy:client-context')) return text;
  return text.replace(PRIMER_RE, '').trimStart();
}

/**
 * Approximate token count for the per-session primer (chars/4 heuristic).
 * Computed once at module load. Update CONVENTION_VERSION when the text
 * changes and this will recompute automatically.
 */
export const PRIMER_TOKEN_ESTIMATE = Math.round(buildClientContextDirective().length / 4);
