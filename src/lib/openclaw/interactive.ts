/**
 * ClawBoy interactive directive parser.
 *
 * Convention: AI assistants emit a hidden HTML comment at the end of a message
 * to signal that the user should be presented with interactive reply options.
 *
 * Single-question form (backward-compatible):
 *   <!-- clawboy:options
 *   {"choices":[{"label":"Yes","value":"Yes please"},...]}
 *   -->
 *
 * Multi-question form:
 *   <!-- clawboy:options
 *   {"questions":[
 *     {"id":"q1","prompt":"First question?","choices":[...]},
 *     {"id":"q2","prompt":"Second question?","choices":[...]}
 *   ]}
 *   -->
 *
 * Replies sent back to the gateway include a matching answers directive in
 * the user message content, immediately followed by a human-readable summary:
 *
 *   <!-- clawboy:answers
 *   {"q1":"chosen value","q2":null}
 *   -->
 *
 *   1. First question: Chosen label
 *   2. Second question: (skipped)
 *
 * HTML comments are stripped by every standard markdown renderer (markdown-it,
 * the OpenClaw web UI, Discord/Telegram/Slack bridges, etc.), so non-ClawBoy
 * clients see only the human-readable summary lines and the prose.
 *
 * Only the LAST valid `clawboy:options` directive per assistant message is
 * honoured. On parse/validation failure the comment is left in `cleanText`
 * (still invisible in any markdown renderer — graceful degradation).
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
 * The parsed payload from a `<!-- clawboy:options {...} -->` directive.
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
// Options directive — parsing
// ---------------------------------------------------------------------------

// Matches <!-- clawboy:options ... --> (case-insensitive, lazy multi-line).
const DIRECTIVE_RE = /<!--\s*clawboy:options\s*([\s\S]*?)\s*-->/gi;

// Matches any clawboy:options comment including an incomplete (streaming) one.
const RENDER_STRIP_RE = /<!--\s*clawboy:options[\s\S]*/i;

/**
 * Strip any `clawboy:options` comment from text before markdown rendering.
 * Aggressively removes from the opening tag to end of string, so partial
 * JSON during streaming never leaks into the chat bubble.
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

// ---------------------------------------------------------------------------
// Answers directive — building and parsing
// ---------------------------------------------------------------------------

/**
 * Build the full user message content for a multi-answer reply.
 *
 * Output format:
 *   <!-- clawboy:answers
 *   {"q1":"chosen value","q2":null}
 *   -->
 *
 *   1. First question: Chosen label
 *   2. Second question: (skipped)
 *
 * `answers`: Record mapping question id → string value (choice.value or
 * freeform text) or null (skipped). Missing ids are treated as skipped.
 *
 * The hidden comment carries the machine-readable payload for the agent;
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

  const directive = `<!-- clawboy:answers\n${JSON.stringify(jsonAnswers)}\n-->`;
  return `${directive}\n\n${summaryLines.join('\n')}`;
}

// Matches the complete <!-- clawboy:answers ... --> comment (case-insensitive).
const ANSWERS_DIRECTIVE_RE = /<!--\s*clawboy:answers\s*([\s\S]*?)\s*-->/i;

// Matches the answers comment block for render-time stripping.
const ANSWERS_RENDER_STRIP_RE = /<!--\s*clawboy:answers[\s\S]*?-->\s*/i;

/**
 * Parse a `<!-- clawboy:answers {...} -->` directive from a user message.
 *
 * Returns a Record mapping question id → string (answered) or null (skipped),
 * or null if the directive is absent or malformed.
 */
export function parseClawboyAnswers(text: string): Record<string, string | null> | null {
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
 * Strip the `<!-- clawboy:answers ... -->` comment from user message text
 * before rendering or display. Leaves the human-readable summary lines intact.
 */
export function stripClawboyAnswersForRender(text: string): string {
  if (!text.toLowerCase().includes('clawboy:answers')) return text;
  return text.replace(ANSWERS_RENDER_STRIP_RE, '').trimStart();
}

// ---------------------------------------------------------------------------
// Consumed-state derivation
// ---------------------------------------------------------------------------

/**
 * Determine per-question survey state from the next user message.
 *
 * Prefers parsing a `<!-- clawboy:answers {...} -->` block (precise, per-id).
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

  // --- Path 1: clawboy:answers directive (multi-question, precise) ---
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
