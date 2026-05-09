/**
 * ClawBoy interactive directive parser.
 *
 * Convention: AI assistants emit a hidden HTML comment at the end of a message
 * to signal that the user should be presented with interactive reply options:
 *
 *   Which approach should I take?
 *
 *   <!-- clawboy:options
 *   {
 *     "choices": [
 *       { "label": "Refactor first", "value": "Refactor the existing code first" },
 *       { "label": "Add tests", "value": "Add tests first, then refactor" }
 *     ],
 *     "allowFreeText": true,
 *     "freeTextPlaceholder": "Or describe your preference…"
 *   }
 *   -->
 *
 * HTML comments are stripped by every standard markdown renderer (markdown-it,
 * the OpenClaw web UI, Discord/Telegram/Slack bridges, etc.), so non-ClawBoy
 * clients see only the prose. ClawBoy additionally strips the comment from the
 * stored `content` so it never appears in copy/TTS/retry-quote flows.
 *
 * Only the LAST valid directive per message is honoured (single survey per
 * assistant turn). On parse/validation failure the comment is left in
 * `cleanText` (still invisible in any markdown renderer — graceful degradation
 * with no visible artefact for the user).
 */

export interface ClawboyOptionChoice {
  /** Button label shown in the UI. */
  label: string;
  /** Text sent to the gateway as the user's reply when the button is tapped. */
  value: string;
  /** Optional one-line hint shown beneath the label. */
  hint?: string;
}

export interface ClawboyOptionsPrompt {
  /** Optional reinforcing question. Usually omitted — the prose body IS the prompt. */
  prompt?: string;
  choices: ClawboyOptionChoice[];
  /** When true, a free-form TextInput + send button is shown alongside buttons. Default: true. */
  allowFreeText?: boolean;
  /** Placeholder for the free-form input. Default: "Or type a custom reply…" */
  freeTextPlaceholder?: string;
}

// Matches <!-- clawboy:options ... --> (case-insensitive, lazy multi-line).
const DIRECTIVE_RE = /<!--\s*clawboy:options\s*([\s\S]*?)\s*-->/gi;

// Matches any clawboy:options comment including an incomplete (streaming) one
// where --> has not arrived yet. The non-greedy [\s\S]*? stops at --> when
// present; the trailing $ catches the unclosed case at end of string.
// No `g` flag — one match per call is enough since we strip from the first hit onward.
const RENDER_STRIP_RE = /<!--\s*clawboy:options[\s\S]*/i;

/**
 * Strip any `clawboy:options` comment from text before markdown rendering.
 *
 * Unlike `parseClawboyOptions`, this is intentionally aggressive: it removes
 * everything from the opening `<!-- clawboy:options` to the end of the string,
 * handling both complete directives and partial (still-streaming) ones. It is
 * safe because the directive is always appended AFTER the prose body, and is
 * only called at render time — never for storage.
 *
 * This prevents the raw JSON from leaking into the chat bubble during streaming
 * and when the directive JSON is malformed.
 */
export function stripClawboyOptionsForRender(text: string): string {
  if (!text.toLowerCase().includes('clawboy:options')) return text;
  return text.replace(RENDER_STRIP_RE, '').trimEnd();
}

function isValidChoice(c: unknown): c is ClawboyOptionChoice {
  return (
    c !== null &&
    typeof c === 'object' &&
    typeof (c as Record<string, unknown>).label === 'string' &&
    (c as Record<string, unknown>).label !== '' &&
    typeof (c as Record<string, unknown>).value === 'string' &&
    (c as Record<string, unknown>).value !== ''
  );
}

function parseDirectiveBody(body: string): ClawboyOptionsPrompt | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.choices) || obj.choices.length === 0) return null;
  const choices = obj.choices.filter(isValidChoice);
  if (choices.length === 0) return null;

  return {
    prompt: typeof obj.prompt === 'string' && obj.prompt ? obj.prompt : undefined,
    choices,
    allowFreeText: typeof obj.allowFreeText === 'boolean' ? obj.allowFreeText : true,
    freeTextPlaceholder:
      typeof obj.freeTextPlaceholder === 'string' && obj.freeTextPlaceholder
        ? obj.freeTextPlaceholder
        : undefined,
  };
}

export interface ParseClawboyOptionsResult {
  /** Message content with valid directives stripped (safe for copy/TTS/retry). */
  cleanText: string;
  /** Parsed survey prompt, or null when no valid directive was found. */
  prompt: ClawboyOptionsPrompt | null;
}

/**
 * Parse a `<!-- clawboy:options {...} -->` directive from an assistant message.
 *
 * Returns `cleanText` (directive stripped when valid, or original text when
 * the JSON is malformed) and `prompt` (the parsed schema, or null).
 *
 * Only the last valid directive in the message is used.
 */
export function parseClawboyOptions(text: string): ParseClawboyOptionsResult {
  if (!text.toLowerCase().includes('clawboy:options')) {
    return { cleanText: text, prompt: null };
  }

  let prompt: ClawboyOptionsPrompt | null = null;
  // Track the span of the last *valid* directive so we can strip only that.
  let lastValidStart = -1;
  let lastValidEnd = -1;

  let match: RegExpExecArray | null;
  DIRECTIVE_RE.lastIndex = 0;
  while ((match = DIRECTIVE_RE.exec(text)) !== null) {
    const candidate = parseDirectiveBody(match[1] ?? '');
    if (candidate !== null) {
      prompt = candidate;
      lastValidStart = match.index;
      lastValidEnd = match.index + match[0].length;
    }
  }

  if (prompt === null) {
    // No valid directive — return text unchanged (comment still invisible in markdown).
    return { cleanText: text, prompt: null };
  }

  // Strip only the matched comment block; trim trailing whitespace/newlines left behind.
  const before = text.slice(0, lastValidStart);
  const after = text.slice(lastValidEnd);
  const cleanText = (before.trimEnd() + after).trimEnd();

  return { cleanText, prompt };
}

/**
 * Convenience wrapper used by both `openClawMessageToChat` (history path) and
 * `useChat` finalization (streaming path). Applies the `includes` fast-path and
 * returns `{ cleanText, prompt }` — callers never need to repeat the guard.
 *
 * Keeping the logic in one place prevents the two parse sites from drifting.
 */
export function extractInteractiveFromContent(content: string): ParseClawboyOptionsResult {
  return parseClawboyOptions(content);
}

// ---------------------------------------------------------------------------
// Consumed-state derivation
// ---------------------------------------------------------------------------

export interface SurveyConsumedState {
  consumed: true;
  /** Value of the matched choice (undefined when the user replied freeform). */
  chosenValue?: string;
  /** Raw text of the user's freeform reply (undefined when a choice was matched). */
  chosenFreeText?: string;
}

export type SurveyState =
  | { consumed: false }
  | SurveyConsumedState;

/**
 * Determine whether a survey has been answered, and which option was chosen.
 *
 * Pass the raw text of the user message that followed the surveyed assistant
 * turn. Matching is case-insensitive and trims surrounding whitespace.
 *
 * Returns `{ consumed: false }` when `nextUserText` is null/undefined (no
 * following user message yet).
 */
export function deriveSurveyState(
  prompt: ClawboyOptionsPrompt,
  nextUserText: string | null | undefined
): SurveyState {
  if (nextUserText == null) return { consumed: false };

  const normalized = nextUserText.trim().toLowerCase();
  // An empty user message (rare optimistic-send race) should not lock the card
  // and show an empty "You replied:" pill.
  if (!normalized) return { consumed: false };
  for (const choice of prompt.choices) {
    if (
      choice.value.trim().toLowerCase() === normalized ||
      choice.label.trim().toLowerCase() === normalized
    ) {
      return { consumed: true, chosenValue: choice.value };
    }
  }
  // User replied with free-form text — survey is still consumed.
  return { consumed: true, chosenFreeText: nextUserText.trim() };
}
