import {
  composeAnswersMessage,
  deriveSurveyState,
  deriveMultiSurveyState,
  normalizeToQuestions,
  parseClawboyAnswers,
  parseClawboyOptions,
  stripClawboyAnswersForRender,
  stripClawboyDirectivesForRender,
  summarizeAnswersForCollapse,
} from '../openclaw/interactive';

// ---------------------------------------------------------------------------
// parseClawboyOptions — single-question (choices[] form, backward-compat)
// ---------------------------------------------------------------------------

describe('parseClawboyOptions — single-question (choices[])', () => {
  it('returns original text unchanged when no directive is present', () => {
    const text = 'Which database? Postgres or SQLite?';
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(cleanText).toBe(text);
    expect(prompt).toBeNull();
  });

  it('parses a valid directive and strips it from cleanText', () => {
    const text = [
      'Which database should I use?',
      '',
      '<!-- clawboy:options',
      '{"choices":[{"label":"Postgres","value":"Use Postgres"},{"label":"SQLite","value":"Use SQLite"}]}',
      '-->',
    ].join('\n');

    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(cleanText).toBe('Which database should I use?');
    expect(prompt).not.toBeNull();
    expect(prompt!.choices).toHaveLength(2);
    expect(prompt!.choices![0].label).toBe('Postgres');
    expect(prompt!.choices![0].value).toBe('Use Postgres');
    expect(prompt!.choices![1].label).toBe('SQLite');
  });

  it('defaults allowFreeText to true when omitted', () => {
    const text = '<!-- clawboy:options\n{"choices":[{"label":"A","value":"A"}]}\n-->';
    const { prompt } = parseClawboyOptions(text);
    expect(prompt!.allowFreeText).toBe(true);
  });

  it('respects explicit allowFreeText: false', () => {
    const text = '<!-- clawboy:options\n{"choices":[{"label":"A","value":"A"}],"allowFreeText":false}\n-->';
    const { prompt } = parseClawboyOptions(text);
    expect(prompt!.allowFreeText).toBe(false);
  });

  it('parses optional hint on choices', () => {
    const text = '<!-- clawboy:options\n{"choices":[{"label":"A","value":"a","hint":"fast"}]}\n-->';
    const { prompt } = parseClawboyOptions(text);
    expect(prompt!.choices![0].hint).toBe('fast');
  });

  it('parses optional freeTextPlaceholder', () => {
    const text = '<!-- clawboy:options\n{"choices":[{"label":"A","value":"a"}],"freeTextPlaceholder":"Custom…"}\n-->';
    const { prompt } = parseClawboyOptions(text);
    expect(prompt!.freeTextPlaceholder).toBe('Custom…');
  });

  it('parses optional prompt field', () => {
    const text = '<!-- clawboy:options\n{"prompt":"Pick one:","choices":[{"label":"A","value":"a"}]}\n-->';
    const { prompt } = parseClawboyOptions(text);
    expect(prompt!.prompt).toBe('Pick one:');
  });

  it('leaves text unchanged (graceful degradation) when JSON is malformed', () => {
    const text = '<!-- clawboy:options\n{bad json\n-->';
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(cleanText).toBe(text);
    expect(prompt).toBeNull();
  });

  it('returns null when choices array is empty', () => {
    const text = '<!-- clawboy:options\n{"choices":[]}\n-->';
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(cleanText).toBe(text);
    expect(prompt).toBeNull();
  });

  it('returns null when choices is missing (and no questions)', () => {
    const text = '<!-- clawboy:options\n{"allowFreeText":true}\n-->';
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(cleanText).toBe(text);
    expect(prompt).toBeNull();
  });

  it('filters out choices with empty label or value', () => {
    const text = [
      '<!-- clawboy:options',
      '{"choices":[{"label":"","value":"empty-label"},{"label":"Good","value":""},{"label":"OK","value":"ok"}]}',
      '-->',
    ].join('\n');
    const { prompt } = parseClawboyOptions(text);
    expect(prompt).not.toBeNull();
    expect(prompt!.choices).toHaveLength(1);
    expect(prompt!.choices![0].label).toBe('OK');
  });

  it('honours only the last valid directive when multiple are present', () => {
    const text = [
      '<!-- clawboy:options\n{"choices":[{"label":"First","value":"first"}]}\n-->',
      'Some more text',
      '<!-- clawboy:options\n{"choices":[{"label":"Second","value":"second"}]}\n-->',
    ].join('\n');
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt!.choices![0].label).toBe('Second');
    expect(cleanText).not.toContain('{"choices":[{"label":"Second"');
  });

  it('is case-insensitive on the directive tag', () => {
    const text = '<!-- CLAWBOY:OPTIONS\n{"choices":[{"label":"A","value":"a"}]}\n-->';
    const { prompt } = parseClawboyOptions(text);
    expect(prompt).not.toBeNull();
  });

  it('trims trailing newlines from cleanText', () => {
    const text = 'Question?\n\n<!-- clawboy:options\n{"choices":[{"label":"A","value":"a"}]}\n-->\n\n';
    const { cleanText } = parseClawboyOptions(text);
    expect(cleanText).toBe('Question?');
  });

  it('returns empty cleanText gracefully when message is only the directive', () => {
    const text = '<!-- clawboy:options\n{"choices":[{"label":"A","value":"a"}]}\n-->';
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(cleanText).toBe('');
    expect(prompt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseClawboyOptions — primary link-ref format
// ---------------------------------------------------------------------------

describe('parseClawboyOptions — link-ref form (primary)', () => {
  function makeLinkRef(payload: object): string {
    return `[clawboy-options]: <data:application/json;base64,${Buffer.from(JSON.stringify(payload)).toString('base64')}>`;
  }

  it('parses a valid single-question link-ref directive', () => {
    const payload = { choices: [{ label: 'Yes', value: 'Yes please' }, { label: 'No', value: 'No thanks' }] };
    const text = `Which do you prefer?\n\n${makeLinkRef(payload)}`;
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(cleanText).toBe('Which do you prefer?');
    expect(prompt).not.toBeNull();
    expect(prompt!.choices).toHaveLength(2);
    expect(prompt!.choices![0].label).toBe('Yes');
  });

  it('parses a valid multi-question link-ref directive', () => {
    const payload = {
      questions: [
        { id: 'q1', prompt: 'DB?', choices: [{ label: 'Postgres', value: 'pg' }] },
        { id: 'q2', prompt: 'Auth?', choices: [{ label: 'JWT', value: 'jwt' }] },
      ],
    };
    const text = `Setup questions:\n\n${makeLinkRef(payload)}`;
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(cleanText).toBe('Setup questions:');
    expect(prompt!.questions).toHaveLength(2);
    expect(prompt!.questions![0].id).toBe('q1');
  });

  it('strips link-ref when directive-only message (empty cleanText)', () => {
    const payload = { choices: [{ label: 'A', value: 'a' }] };
    const { cleanText, prompt } = parseClawboyOptions(makeLinkRef(payload));
    expect(cleanText).toBe('');
    expect(prompt).not.toBeNull();
  });

  it('falls back to legacy form when link-ref is malformed base64', () => {
    const legacyText = '<!-- clawboy:options\n{"choices":[{"label":"A","value":"a"}]}\n-->';
    const text = '[clawboy-options]: <data:application/json;base64,!!!invalid!!!>\n\n' + legacyText;
    const { prompt } = parseClawboyOptions(text);
    expect(prompt).not.toBeNull();
    expect(prompt!.choices![0].label).toBe('A');
  });

  it('prefers link-ref over legacy when both present', () => {
    const payload = { choices: [{ label: 'LinkRef', value: 'linkref' }] };
    const legacyText = '<!-- clawboy:options\n{"choices":[{"label":"Legacy","value":"legacy"}]}\n-->';
    const text = `${makeLinkRef(payload)}\n\n${legacyText}`;
    const { prompt } = parseClawboyOptions(text);
    expect(prompt!.choices![0].label).toBe('LinkRef');
  });
});

// ---------------------------------------------------------------------------
// parseClawboyOptions — multi-question (questions[] form)
// ---------------------------------------------------------------------------

describe('parseClawboyOptions — multi-question (questions[])', () => {
  const multiDirective = [
    '<!-- clawboy:options',
    JSON.stringify({
      questions: [
        { id: 'q1', prompt: 'First?', choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
        { id: 'q2', prompt: 'Second?', choices: [{ label: 'X', value: 'x' }], allowFreeText: false },
      ],
    }),
    '-->',
  ].join('\n');

  it('parses questions[] array and sets prompt.questions', () => {
    const { prompt, cleanText } = parseClawboyOptions(`Prose\n\n${multiDirective}`);
    expect(cleanText).toBe('Prose');
    expect(prompt).not.toBeNull();
    expect(prompt!.questions).toHaveLength(2);
    expect(prompt!.questions![0].id).toBe('q1');
    expect(prompt!.questions![0].prompt).toBe('First?');
    expect(prompt!.questions![0].choices).toHaveLength(2);
    expect(prompt!.questions![1].allowFreeText).toBe(false);
  });

  it('auto-assigns sequential id when id is missing', () => {
    const text = [
      '<!-- clawboy:options',
      JSON.stringify({
        questions: [
          { choices: [{ label: 'A', value: 'a' }] },
          { choices: [{ label: 'B', value: 'b' }] },
        ],
      }),
      '-->',
    ].join('\n');
    const { prompt } = parseClawboyOptions(text);
    expect(prompt!.questions![0].id).toBe('q1');
    expect(prompt!.questions![1].id).toBe('q2');
  });

  it('deduplicates ids by appending index suffix on collision', () => {
    const text = [
      '<!-- clawboy:options',
      JSON.stringify({
        questions: [
          { id: 'same', choices: [{ label: 'A', value: 'a' }] },
          { id: 'same', choices: [{ label: 'B', value: 'b' }] },
        ],
      }),
      '-->',
    ].join('\n');
    const { prompt } = parseClawboyOptions(text);
    const ids = prompt!.questions!.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns null when all questions have no valid choices', () => {
    const text = [
      '<!-- clawboy:options',
      JSON.stringify({ questions: [{ id: 'q1', choices: [] }] }),
      '-->',
    ].join('\n');
    const { prompt } = parseClawboyOptions(text);
    expect(prompt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeToQuestions
// ---------------------------------------------------------------------------

describe('normalizeToQuestions', () => {
  it('wraps a choices[] prompt as a single question with id _single', () => {
    const qs = normalizeToQuestions({ choices: [{ label: 'A', value: 'a' }], prompt: 'Pick:' });
    expect(qs).toHaveLength(1);
    expect(qs[0].id).toBe('_single');
    expect(qs[0].prompt).toBe('Pick:');
  });

  it('returns questions[] as-is', () => {
    const questions = [
      { id: 'q1', choices: [{ label: 'A', value: 'a' }] },
      { id: 'q2', choices: [{ label: 'B', value: 'b' }] },
    ];
    const qs = normalizeToQuestions({ questions });
    expect(qs).toBe(questions);
  });
});

// ---------------------------------------------------------------------------
// deriveMultiSurveyState — single-question backward-compat
// ---------------------------------------------------------------------------

const twoChoices = {
  choices: [
    { label: 'Yes', value: 'Yes please' },
    { label: 'No', value: 'No thanks' },
  ],
};

describe('deriveSurveyState (legacy wrapper)', () => {
  it('returns consumed:false when nextUserText is null', () => {
    expect(deriveSurveyState(twoChoices, null)).toEqual({ consumed: false });
  });

  it('matches exact choice value (case-insensitive)', () => {
    const state = deriveSurveyState(twoChoices, 'yes please');
    expect(state).toEqual({ consumed: true, chosenValue: 'Yes please' });
  });

  it('matches choice label as fallback (case-insensitive)', () => {
    const state = deriveSurveyState(twoChoices, 'YES');
    expect(state).toEqual({ consumed: true, chosenValue: 'Yes please' });
  });

  it('trims whitespace when matching', () => {
    const state = deriveSurveyState(twoChoices, '  No thanks  ');
    expect(state).toEqual({ consumed: true, chosenValue: 'No thanks' });
  });

  it('returns chosenFreeText when text does not match any choice', () => {
    const state = deriveSurveyState(twoChoices, 'I prefer neither');
    expect(state).toEqual({ consumed: true, chosenFreeText: 'I prefer neither' });
  });

  it('returns consumed:false when nextUserText is empty string (C3 regression)', () => {
    expect(deriveSurveyState(twoChoices, '')).toEqual({ consumed: false });
  });
});

describe('deriveMultiSurveyState — clawboy:answers parsing', () => {
  const multiPrompt = {
    questions: [
      { id: 'agent_id', choices: [{ label: 'twinkle', value: 'twinkle' }, { label: 'glow', value: 'glow' }] },
      { id: 'workspace', choices: [{ label: 'Match', value: 'match' }] },
      { id: 'user_md', choices: [{ label: 'Blank', value: 'blank' }] },
    ],
  };

  it('returns all consumed:false when nextUserText is null', () => {
    const states = deriveMultiSurveyState(multiPrompt, null);
    expect(states['agent_id']).toEqual({ consumed: false });
    expect(states['workspace']).toEqual({ consumed: false });
    expect(states['user_md']).toEqual({ consumed: false });
  });

  it('parses clawboy:answers directive and returns per-question states', () => {
    const rawMsg =
      '<!-- clawboy:answers\n{"agent_id":"twinkle","workspace":"match","user_md":null}\n-->\n\n1. ...\n2. ...\n3. (skipped)';
    const states = deriveMultiSurveyState(multiPrompt, rawMsg);
    expect(states['agent_id']).toEqual({ consumed: true, chosenValue: 'twinkle' });
    expect(states['workspace']).toEqual({ consumed: true, chosenValue: 'match' });
    expect(states['user_md']).toEqual({ consumed: true });
  });

  it('treats freeform answers (non-matching values) as chosenFreeText', () => {
    const rawMsg = `<!-- clawboy:answers\n{"agent_id":"luna","workspace":"match","user_md":null}\n-->`;
    const states = deriveMultiSurveyState(multiPrompt, rawMsg);
    expect(states['agent_id']).toEqual({ consumed: true, chosenFreeText: 'luna' });
  });

  it('falls back to label/value match for single-question with no answers directive', () => {
    const states = deriveMultiSurveyState(twoChoices, 'Yes please');
    expect(states['_single']).toEqual({ consumed: true, chosenValue: 'Yes please' });
  });
});

// ---------------------------------------------------------------------------
// composeAnswersMessage + parseClawboyAnswers round-trip
// ---------------------------------------------------------------------------

describe('composeAnswersMessage + parseClawboyAnswers round-trip', () => {
  const multiPrompt = {
    questions: [
      { id: 'q1', prompt: 'Agent id?', choices: [{ label: 'twinkle', value: 'twinkle' }, { label: 'glow', value: 'glow' }] },
      { id: 'q2', prompt: 'Workspace dir?', choices: [{ label: 'Match', value: 'match' }] },
      { id: 'q3', prompt: 'USER.md?', choices: [{ label: 'Blank', value: 'blank' }] },
    ],
  };

  it('composes a message with link-ref directive + summary lines', () => {
    const raw = composeAnswersMessage(multiPrompt, { q1: 'twinkle', q2: 'match', q3: null });
    expect(raw).toContain('[clawboy-answers]: <data:application/json;base64,');
    expect(raw).toContain('1. Agent id?: twinkle');
    expect(raw).toContain('2. Workspace dir?: Match');
    expect(raw).toContain('3. USER.md?: (skipped)');
    // JSON payload is base64-encoded — verify via round-trip
    const parsed = parseClawboyAnswers(raw);
    expect(parsed!['q1']).toBe('twinkle');
    expect(parsed!['q2']).toBe('match');
    expect(parsed!['q3']).toBeNull();
  });

  it('round-trips through parseClawboyAnswers', () => {
    const raw = composeAnswersMessage(multiPrompt, { q1: 'twinkle', q2: null, q3: 'blank' });
    const parsed = parseClawboyAnswers(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!['q1']).toBe('twinkle');
    expect(parsed!['q2']).toBeNull();
    expect(parsed!['q3']).toBe('blank');
  });

  it('uses "Question N" fallback label when question has no prompt', () => {
    const noprompt = { questions: [{ id: 'a', choices: [{ label: 'X', value: 'x' }] }] };
    const raw = composeAnswersMessage(noprompt, { a: 'x' });
    expect(raw).toContain('1. Question 1: X');
  });

  it('shows freeform value in summary when it does not match any choice', () => {
    const raw = composeAnswersMessage(multiPrompt, { q1: 'stella', q2: null, q3: null });
    expect(raw).toContain('1. Agent id?: stella');
  });

  it('works for single-question legacy shape (choices[])', () => {
    const raw = composeAnswersMessage(twoChoices, { _single: 'Yes please' });
    expect(raw).toContain('[clawboy-answers]: <data:application/json;base64,');
    expect(raw).toContain('1. Question 1: Yes');
    // verify payload via round-trip
    const parsed = parseClawboyAnswers(raw);
    expect(parsed!['_single']).toBe('Yes please');
  });
});

// ---------------------------------------------------------------------------
// parseClawboyAnswers
// ---------------------------------------------------------------------------

describe('parseClawboyAnswers', () => {
  it('returns null when no directive is present', () => {
    expect(parseClawboyAnswers('normal user message')).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    expect(parseClawboyAnswers('<!-- clawboy:answers\n{bad\n-->')).toBeNull();
  });

  it('returns null when value is an array (invalid)', () => {
    expect(parseClawboyAnswers('<!-- clawboy:answers\n[]\n-->')).toBeNull();
  });

  it('skips non-string non-null values', () => {
    const result = parseClawboyAnswers('<!-- clawboy:answers\n{"a":"x","b":42,"c":null}\n-->');
    expect(result).not.toBeNull();
    expect(result!['a']).toBe('x');
    expect(result!['b']).toBeUndefined();
    expect(result!['c']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stripClawboyAnswersForRender
// ---------------------------------------------------------------------------

describe('stripClawboyAnswersForRender', () => {
  it('returns text unchanged when no directive is present', () => {
    const text = 'Hello world';
    expect(stripClawboyAnswersForRender(text)).toBe(text);
  });

  it('strips the answers comment block, leaving human-readable summary', () => {
    const text = '<!-- clawboy:answers\n{"q1":"a"}\n-->\n\n1. Q1: a';
    const result = stripClawboyAnswersForRender(text);
    expect(result).not.toContain('clawboy:answers');
    expect(result).toContain('1. Q1: a');
  });
});

// ---------------------------------------------------------------------------
// stripClawboyDirectivesForRender
// ---------------------------------------------------------------------------

describe('stripClawboyDirectivesForRender', () => {
  it('returns text unchanged when no directive is present', () => {
    const text = 'Hello world';
    expect(stripClawboyDirectivesForRender(text)).toBe(text);
  });

  it('strips a complete :options directive from the end of a message', () => {
    const text = 'Pick one:\n\n<!-- clawboy:options\n{"choices":[{"label":"A","value":"a"}]}\n-->';
    expect(stripClawboyDirectivesForRender(text)).toBe('Pick one:');
  });

  it('strips an incomplete (still-streaming) :options directive', () => {
    const text = 'Some text\n\n<!-- clawboy:options\n{"choices":[{"la';
    expect(stripClawboyDirectivesForRender(text)).toBe('Some text');
  });

  it('strips a multi-question :options directive', () => {
    const text = 'Q\n\n<!-- clawboy:options\n{"questions":[{"id":"q1","choices":[{"label":"A","value":"a"}]}]}\n-->';
    expect(stripClawboyDirectivesForRender(text)).toBe('Q');
  });

  it('is case-insensitive', () => {
    const text = 'Q\n<!-- CLAWBOY:OPTIONS\n{}\n-->';
    expect(stripClawboyDirectivesForRender(text)).toBe('Q');
  });

  it('strips a complete :answers directive, preserving the summary text after it', () => {
    const text = '<!-- clawboy:answers\n{"_single":"Use PostgreSQL"}\n-->\n\n1. Question 1: PostgreSQL';
    const result = stripClawboyDirectivesForRender(text);
    expect(result).not.toContain('clawboy:answers');
    expect(result).toContain('1. Question 1: PostgreSQL');
  });

  it('strips an incomplete (streaming) :answers directive', () => {
    const text = '<!-- clawboy:answers\n{"_single":"Use';
    expect(stripClawboyDirectivesForRender(text)).toBe('');
  });

  it('strips both :options and :answers when both are present', () => {
    const text = 'Prose\n\n<!-- clawboy:options\n{"choices":[{"label":"A","value":"a"}]}\n-->\n\n<!-- clawboy:answers\n{"_single":"a"}\n-->';
    const result = stripClawboyDirectivesForRender(text);
    expect(result).not.toContain('clawboy:');
    expect(result).toContain('Prose');
  });

  it('leaves non-clawboy HTML comments alone', () => {
    const text = 'Text <!-- regular comment --> more text';
    expect(stripClawboyDirectivesForRender(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// summarizeAnswersForCollapse
// ---------------------------------------------------------------------------

describe('summarizeAnswersForCollapse', () => {
  const singlePrompt = {
    choices: [
      { label: 'PostgreSQL', value: 'Use PostgreSQL' },
      { label: 'SQLite', value: 'Use SQLite' },
    ],
  };

  const multiPrompt = {
    questions: [
      { id: 'q1', prompt: 'DB?', choices: [{ label: 'Postgres', value: 'pg' }, { label: 'SQLite', value: 'sqlite' }] },
      { id: 'q2', prompt: 'Auth?', choices: [{ label: 'JWT', value: 'jwt' }, { label: 'Session', value: 'session' }] },
    ],
  };

  it('single-Q: returns chosen label', () => {
    const states = { _single: { consumed: true as const, chosenValue: 'Use PostgreSQL' } };
    expect(summarizeAnswersForCollapse(singlePrompt, states)).toBe('PostgreSQL');
  });

  it('single-Q: returns free-text value', () => {
    const states = { _single: { consumed: true as const, chosenFreeText: 'MySQL please' } };
    expect(summarizeAnswersForCollapse(singlePrompt, states)).toBe('MySQL please');
  });

  it('single-Q: returns (skipped) when neither choice nor free-text', () => {
    const states = { _single: { consumed: true as const } };
    expect(summarizeAnswersForCollapse(singlePrompt, states)).toBe('(skipped)');
  });

  it('single-Q: returns (skipped) when state is live (not consumed)', () => {
    const states = { _single: { consumed: false as const } };
    expect(summarizeAnswersForCollapse(singlePrompt, states)).toBe('(skipped)');
  });

  it('multi-Q: returns dot-separated labels', () => {
    const states = {
      q1: { consumed: true as const, chosenValue: 'pg' },
      q2: { consumed: true as const, chosenValue: 'jwt' },
    };
    expect(summarizeAnswersForCollapse(multiPrompt, states)).toBe('Postgres · JWT');
  });

  it('multi-Q: shows (skipped) for unanswered questions', () => {
    const states = {
      q1: { consumed: true as const, chosenValue: 'pg' },
      q2: { consumed: true as const },
    };
    expect(summarizeAnswersForCollapse(multiPrompt, states)).toBe('Postgres · (skipped)');
  });

  it('multi-Q: truncates at 80 chars with ellipsis', () => {
    const longPrompt = {
      questions: Array.from({ length: 5 }, (_, i) => ({
        id: `q${i}`,
        choices: [{ label: 'A very long label indeed', value: `v${i}` }],
      })),
    };
    const states = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`q${i}`, { consumed: true as const, chosenValue: `v${i}` }]),
    );
    const result = summarizeAnswersForCollapse(longPrompt, states);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith('…')).toBe(true);
  });
});
