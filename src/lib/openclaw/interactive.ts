/**
 * ClawBoy interactive directive parser.
 *
 * Convention: AI assistants emit a hidden directive at the end of a message
 * to signal that the user should be presented with interactive reply options.
 *
 * PRIMARY FORMAT — markdown link-reference definition (preferred):
 *
 *   [clawboy-options]: <data:application/json;base64,BASE64_ENCODED_JSON>
 *
 * The JSON payload is the same schema as the legacy form:
 *
 *   Single-question: {"choices":[{"label":"Yes","value":"Yes please"},...]}
 *   Multi-question:  {"questions":[{"id":"q1","prompt":"...","choices":[...]},...]}
 *
 * Markdown link-reference definitions (CommonMark §4.7) render to nothing in
 * every conforming renderer — markdown-it, the OpenClaw web UI, GitHub,
 * Discord, Telegram, Slack — when no link in the document refers to them.
 * This is the safe cross-client container.
 *
 * LEGACY FORMAT — HTML comment (still parsed, do not emit in new messages):
 *
 *   <!-- clawboy:options
 *   {"choices":[...]}
 *   -->
 *
 * HTML comments are NOT reliably stripped by all renderers. The OpenClaw
 * webchat renders them as raw text. Use only the link-ref form going forward.
 *
 * ANSWERS — user replies use the same link-ref convention:
 *
 *   [clawboy-answers]: <data:application/json;base64,BASE64_ENCODED_JSON>
 *
 *   1. First question: Chosen label
 *   2. Second question: (skipped)
 *
 * The link-ref is stripped at render time; only the human-readable summary
 * reaches the UI. The embedded JSON carries the machine-readable payload for
 * the agent; the numbered list forwards cleanly to non-ClawBoy clients.
 *
 * Only the LAST valid `clawboy-options` directive per assistant message is
 * honoured. On parse/validation failure the directive is left in `cleanText`
 * (still invisible in any conforming renderer — graceful degradation).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClawboyOptionChoice {
  /** Button label shown in the UI. */
  label: string;
  /** Text sent to the gateway as the user's reply when the button is tapped. */
  value: string;
  /** Optional one-line hint shown beneath the label. */
  hint?: string;
}

/**
 * A single question in a multi-question prompt.
 * Each question has a stable `id` used to key answers in `clawboy:answers`.
 */
export interface ClawboyQuestion {
  /**
   * Stable identifier for this question.
   * Used as the key in the `clawboy:answers` JSON payload.
   * For single-question backward-compat, the synthetic id is `_single`.
   */
  id: string;
  /** Optional question text shown above the choices in the paginated card. */
  prompt?: string;
  /** At least one choice is required. */
  choices: ClawboyOptionChoice[];
  /** When true, a free-form TextInput is shown alongside buttons. Default: true. */
  allowFreeText?: boolean;
  /** Placeholder for the free-form input. */
  freeTextPlaceholder?: string;
}

/**
 * The parsed payload from a `clawboy-options` directive.
 *
 * Multi-question form: `questions` is populated.
 * Single-question form (legacy): `choices` is populated, `questions` is absent.
 *
 * Always use `normalizeToQuestions(prompt)` downstream — never access
 * `choices` or `questions` directly.
 */
export interface ClawboyOptionsPrompt {
  /** Multi-question form: array of independent questions. */
  questions?: ClawboyQuestion[];
  /** Single-question form (legacy). Ignored when `questions` is present. */
  choices?: ClawboyOptionChoice[];
  /** Optional reinforcing label shown above the choices (single-question only). */
  prompt?: string;
  /** Default for top-level single-question; per-question value takes precedence. */
  allowFreeText?: boolean;
  /** Default placeholder for single-question form. */
  freeTextPlaceholder?: string;
}

// ---------------------------------------------------------------------------
// Consumed-state types
// ---------------------------------------------------------------------------

export interface SurveyConsumedState {
  consumed: true;
  /** Value of the matched choice (undefined when the user replied freeform or skipped). */
  chosenValue?: string;
  /** Raw text of the user's freeform reply (undefined when a choice was matched or skipped). */
  chosenFreeText?: string;
}

export type SurveyState =
  | { consumed: false }
  | SurveyConsumedState;

/**
 * Per-question survey states keyed by question id.
 * Returned by `deriveMultiSurveyState`.
 */
export type MultiSurveyStates = Record<string, SurveyState>;

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Normalize any `ClawboyOptionsPrompt` to an ordered array of `ClawboyQuestion`.
 *
 * - `questions[]` form → returned as-is.
 * - `choices[]` form (legacy single-question) → wrapped in a single entry
 *   with id `'_single'`.
 *
 * All downstream rendering and state derivation uses this array; callers
 * must never inspect `prompt.choices` or `prompt.questions` directly.
 */
export function normalizeToQuestions(prompt: ClawboyOptionsPrompt): ClawboyQuestion[] {
  if (prompt.questions && prompt.questions.length > 0) {
    return prompt.questions;
  }
  return [
    {
      id: '_single',
      prompt: prompt.prompt,
      choices: prompt.choices ?? [],
      allowFreeText: prompt.allowFreeText,
      freeTextPlaceholder: prompt.freeTextPlaceholder,
    },
  ];
}

// ---------------------------------------------------------------------------
// Options directive — regex constants
// ---------------------------------------------------------------------------

// Legacy: <!-- clawboy:options ... --> (HTML comment form)
const DIRECTIVE_RE = /<!--\s*clawboy:options\s*([\s\S]*?)\s*-->/gi;

// Legacy: any clawboy:* comment, complete or streaming (open tag → close tag or EOF)
const CLAWBOY_COMMENT_STRIP_RE = /<!--\s*clawboy:[\s\S]*?(?:-->|$)/gi;

// Primary: [clawboy-options]: <data:application/json;base64,BASE64>
// Multiline flag so ^ and $ match line boundaries.
const LINKREF_OPTIONS_RE =
  /^\[clawboy-options\]:\s*<data:application\/json;base64,([A-Za-z0-9+/=]+)>\s*$/m;

// For stripping the link-ref options line at render time (complete or mid-stream partial).
// Strips the whole line including any leading/trailing newlines.
const LINKREF_OPTIONS_STRIP_RE =
  /\n?\[clawboy-options\]:\s*<[^\n>]*>?\s*\n?/g;

// ---------------------------------------------------------------------------
// Options directive — helpers
// ---------------------------------------------------------------------------

function decodeBase64(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8');
}

function encodeBase64(json: string): string {
  return Buffer.from(json, 'utf8').toString('base64');
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

function parseQuestion(raw: unknown, index: number): ClawboyQuestion | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id =
    typeof obj.id === 'string' && obj.id.trim() !== '' ? obj.id.trim() : `q${index + 1}`;
  if (!Array.isArray(obj.choices) || obj.choices.length === 0) return null;
  const choices = (obj.choices as unknown[]).filter(isValidChoice);
  if (choices.length === 0) return null;
  return {
    id,
    prompt: typeof obj.prompt === 'string' && obj.prompt ? obj.prompt : undefined,
    choices,
    allowFreeText: typeof obj.allowFreeText === 'boolean' ? obj.allowFreeText : true,
    freeTextPlaceholder:
      typeof obj.freeTextPlaceholder === 'string' && obj.freeTextPlaceholder
        ? obj.freeTextPlaceholder
        : undefined,
  };
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

  // Multi-question form: questions[] array
  if (Array.isArray(obj.questions) && obj.questions.length > 0) {
    const questions: ClawboyQuestion[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < obj.questions.length; i++) {
      const q = parseQuestion(obj.questions[i], i);
      if (q === null) continue;
      // Deduplicate ids: append index suffix on collision
      if (seenIds.has(q.id)) {
        q.id = `${q.id}_${i}`;
      }
      seenIds.add(q.id);
      questions.push(q);
    }
    if (questions.length === 0) return null;
    return { questions };
  }

  // Single-question (legacy) form: choices[] at top level
  if (!Array.isArray(obj.choices) || obj.choices.length === 0) return null;
  const choices = (obj.choices as unknown[]).filter(isValidChoice);
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
 * Strip any `clawboy:*` directive from text before markdown rendering.
 * Handles the link-ref form (`[clawboy-options]:`, `[clawboy-answers]:`),
 * the legacy HTML-comment form, and streaming-partial variants.
 */
export function stripClawboyDirectivesForRender(text: string): string {
  const hasComment = text.toLowerCase().includes('clawboy:');
  const hasLinkref = text.includes('[clawboy-options]') || text.includes('[clawboy-answers]');
  if (!hasComment && !hasLinkref) return text;
  let result = text;
  if (hasComment) result = result.replace(CLAWBOY_COMMENT_STRIP_RE, '');
  if (hasLinkref) result = result.replace(LINKREF_OPTIONS_STRIP_RE, '').replace(LINKREF_ANSWERS_STRIP_RE, '');
  return result.trimEnd();
}

/**
 * Parse a `clawboy-options` directive from an assistant message.
 *
 * Tries the primary link-ref form first, then falls back to the legacy
 * HTML-comment form for backward compatibility with older messages.
 *
 * Returns `cleanText` (directive stripped when valid, or original text when
 * the payload is malformed) and `prompt` (the parsed schema, or null).
 *
 * Only the last valid directive in the message is used.
 */
export function parseClawboyOptions(text: string): ParseClawboyOptionsResult {
  // --- Primary: link-ref form ---
  if (text.includes('[clawboy-options]')) {
    const linkRefMatch = LINKREF_OPTIONS_RE.exec(text);
    if (linkRefMatch) {
      const b64 = linkRefMatch[1] ?? '';
      try {
        const json = decodeBase64(b64);
        const prompt = parseDirectiveBody(json);
        if (prompt !== null) {
          const cleanText = text.replace(LINKREF_OPTIONS_STRIP_RE, '').trimEnd();
          return { cleanText, prompt };
        }
      } catch {
        // malformed base64 — fall through
      }
    }
  }

  // --- Legacy: HTML-comment form ---
  if (!text.toLowerCase().includes('clawboy:options')) {
    return { cleanText: text, prompt: null };
  }

  let prompt: ClawboyOptionsPrompt | null = null;
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
    return { cleanText: text, prompt: null };
  }

  const before = text.slice(0, lastValidStart);
  const after = text.slice(lastValidEnd);
  const cleanText = (before.trimEnd() + after).trimEnd();

  return { cleanText, prompt };
}

/**
 * Convenience wrapper used by both `openClawMessageToChat` (history path) and
 * `useChat` finalization (streaming path).
 */
export function extractInteractiveFromContent(content: string): ParseClawboyOptionsResult {
  return parseClawboyOptions(content);
}

/** Returns true when text contains a `clawboy-options` directive in any supported form. */
export function hasClawboyOptionsDirective(text: string): boolean {
  return text.includes('[clawboy-options]') || text.toLowerCase().includes('clawboy:options');
}

/** Returns true when text contains a `clawboy-answers` directive in any supported form. */
export function hasClawboyAnswersDirective(text: string): boolean {
  return text.includes('[clawboy-answers]') || text.toLowerCase().includes('clawboy:answers');
}

// ---------------------------------------------------------------------------
// Answers directive — regex constants
// ---------------------------------------------------------------------------

// Primary: [clawboy-answers]: <data:application/json;base64,BASE64>
const LINKREF_ANSWERS_RE =
  /^\[clawboy-answers\]:\s*<data:application\/json;base64,([A-Za-z0-9+/=]+)>\s*$/m;

// For stripping the link-ref answers line at render time (complete or partial).
const LINKREF_ANSWERS_STRIP_RE =
  /\n?\[clawboy-answers\]:\s*<[^\n>]*>?\s*\n?/g;

// Legacy: complete <!-- clawboy:answers ... --> comment
const ANSWERS_DIRECTIVE_RE = /<!--\s*clawboy:answers\s*([\s\S]*?)\s*-->/i;

// Legacy: for render-time stripping of the full answers comment block
const ANSWERS_COMMENT_STRIP_RE = /<!--\s*clawboy:answers[\s\S]*?-->\s*/i;

// ---------------------------------------------------------------------------
// Answers directive — building and parsing
// ---------------------------------------------------------------------------

/**
 * Build the full user message content for a multi-answer reply.
 *
 * Output format (primary link-ref form):
 *   [clawboy-answers]: <data:application/json;base64,BASE64>
 *
 *   1. First question: Chosen label
 *   2. Second question: (skipped)
 *
 * `answers`: Record mapping question id → string value (choice.value or
 * freeform text) or null (skipped). Missing ids are treated as skipped.
 *
 * The link-ref carries the machine-readable payload for the agent;
 * the visible numbered list is human-readable and forwards to other clients.
 */
export function composeAnswersMessage(
  prompt: ClawboyOptionsPrompt,
  answers: Record<string, string | null>,
): string {
  const questions = normalizeToQuestions(prompt);

  const jsonAnswers: Record<string, string | null> = {};
  const summaryLines: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    const answer = answers[q.id] ?? null;
    jsonAnswers[q.id] = answer;

    let displayAnswer: string;
    if (answer === null) {
      displayAnswer = '(skipped)';
    } else {
      const matched = q.choices.find((c) => c.value === answer);
      displayAnswer = matched ? matched.label : answer;
    }

    const questionLabel = q.prompt ?? `Question ${i + 1}`;
    summaryLines.push(`${i + 1}. ${questionLabel}: ${displayAnswer}`);
  }

  const b64 = encodeBase64(JSON.stringify(jsonAnswers));
  const directive = `[clawboy-answers]: <data:application/json;base64,${b64}>`;
  return `${directive}\n\n${summaryLines.join('\n')}`;
}

/**
 * Build a one-line summary of the answers given in `surveyStates`.
 *
 * Single-question: returns the chosen label, free-text value, or `(skipped)`.
 * Multi-question: returns `"Q1 label · Q2 label · …"` truncated at 80 chars.
 */
export function summarizeAnswersForCollapse(
  prompt: ClawboyOptionsPrompt,
  surveyStates: MultiSurveyStates,
): string {
  const questions = normalizeToQuestions(prompt);
  const parts: string[] = [];

  for (const q of questions) {
    const state = surveyStates[q.id];
    if (!state?.consumed) {
      parts.push('(skipped)');
      continue;
    }
    const consumed = state as SurveyConsumedState;
    if (consumed.chosenValue !== undefined) {
      const matched = q.choices.find((c) => c.value === consumed.chosenValue);
      parts.push(matched ? matched.label : consumed.chosenValue);
    } else if (consumed.chosenFreeText !== undefined) {
      parts.push(consumed.chosenFreeText);
    } else {
      parts.push('(skipped)');
    }
  }

  if (questions.length === 1) {
    return parts[0] ?? '(skipped)';
  }

  const joined = parts.join(' · ');
  return joined.length > 80 ? joined.slice(0, 79) + '…' : joined;
}

/**
 * Parse a `clawboy-answers` directive from a user message.
 *
 * Tries the primary link-ref form first, then falls back to the legacy
 * HTML-comment form.
 *
 * Returns a Record mapping question id → string (answered) or null (skipped),
 * or null if the directive is absent or malformed.
 */
export function parseClawboyAnswers(text: string): Record<string, string | null> | null {
  // --- Primary: link-ref form ---
  if (text.includes('[clawboy-answers]')) {
    const linkRefMatch = LINKREF_ANSWERS_RE.exec(text);
    if (linkRefMatch) {
      const b64 = linkRefMatch[1] ?? '';
      try {
        const parsed = JSON.parse(decodeBase64(b64));
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const result: Record<string, string | null> = {};
          for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof val === 'string') result[key] = val;
            else if (val === null) result[key] = null;
          }
          return result;
        }
      } catch {
        // malformed — fall through
      }
    }
  }

  // --- Legacy: HTML-comment form ---
  if (!text.toLowerCase().includes('clawboy:answers')) return null;
  const match = ANSWERS_DIRECTIVE_RE.exec(text);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1] ?? '');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const result: Record<string, string | null> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val === 'string') result[key] = val;
      else if (val === null) result[key] = null;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Strip the `clawboy-answers` directive from user message text before
 * rendering or display. Leaves the human-readable summary lines intact.
 */
export function stripClawboyAnswersForRender(text: string): string {
  let result = text;
  if (result.includes('[clawboy-answers]')) {
    result = result.replace(LINKREF_ANSWERS_STRIP_RE, '');
  }
  if (result.toLowerCase().includes('clawboy:answers')) {
    result = result.replace(ANSWERS_COMMENT_STRIP_RE, '');
  }
  return result.trimStart();
}

// ---------------------------------------------------------------------------
// Consumed-state derivation
// ---------------------------------------------------------------------------

/**
 * Determine per-question survey state from the next user message.
 *
 * Prefers parsing a `clawboy-answers` block (precise, per-id).
 * Falls back to legacy label/value matching for old single-question messages
 * that predate the answers directive.
 *
 * Returns a `MultiSurveyStates` map: question id → `SurveyState`.
 * When `nextUserText` is null/undefined/empty, all questions return
 * `{ consumed: false }`.
 */
export function deriveMultiSurveyState(
  prompt: ClawboyOptionsPrompt,
  nextUserText: string | null | undefined,
): MultiSurveyStates {
  const questions = normalizeToQuestions(prompt);

  const allLive: MultiSurveyStates = Object.fromEntries(
    questions.map((q) => [q.id, { consumed: false }] as [string, SurveyState]),
  );

  if (nextUserText == null) return allLive;
  const normalized = nextUserText.trim();
  if (!normalized) return allLive;

  // --- Path 1: clawboy-answers directive (multi-question, precise) ---
  const answers = parseClawboyAnswers(normalized);
  if (answers !== null) {
    return Object.fromEntries(
      questions.map((q): [string, SurveyState] => {
        const answer = answers[q.id] ?? null;
        if (answer === null) {
          return [q.id, { consumed: true }];
        }
        const matched = q.choices.find(
          (c) => c.value.trim().toLowerCase() === answer.trim().toLowerCase(),
        );
        if (matched) {
          return [q.id, { consumed: true, chosenValue: matched.value }];
        }
        return [q.id, { consumed: true, chosenFreeText: answer }];
      }),
    );
  }

  // --- Path 2: legacy label/value match (single-question only) ---
  if (questions.length === 1) {
    const q = questions[0]!;
    const norm = normalized.toLowerCase();
    for (const choice of q.choices) {
      if (
        choice.value.trim().toLowerCase() === norm ||
        choice.label.trim().toLowerCase() === norm
      ) {
        return { [q.id]: { consumed: true, chosenValue: choice.value } };
      }
    }
    return { [q.id]: { consumed: true, chosenFreeText: normalized } };
  }

  // Multi-question with no answers directive: mark all consumed (answer body
  // is present but not machine-readable — just lock the card).
  return Object.fromEntries(
    questions.map((q): [string, SurveyState] => [q.id, { consumed: true }]),
  );
}

/**
 * Legacy single-question consumed-state derivation.
 *
 * Kept for backward compatibility with any existing code that has not yet
 * migrated to `deriveMultiSurveyState`. Do not use in new code.
 *
 * @deprecated Use `deriveMultiSurveyState` instead.
 */
export function deriveSurveyState(
  prompt: ClawboyOptionsPrompt,
  nextUserText: string | null | undefined,
): SurveyState {
  const states = deriveMultiSurveyState(prompt, nextUserText);
  const first = Object.values(states)[0];
  return first ?? { consumed: false };
}
