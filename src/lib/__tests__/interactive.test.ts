import {
  parseClawboyOptions,
  deriveSurveyState,
  stripClawboyOptionsForRender,
} from '../openclaw/interactive';

// ---------------------------------------------------------------------------
// parseClawboyOptions
// ---------------------------------------------------------------------------

describe('parseClawboyOptions', () => {
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
    expect(prompt!.choices[0].label).toBe('Postgres');
    expect(prompt!.choices[0].value).toBe('Use Postgres');
    expect(prompt!.choices[1].label).toBe('SQLite');
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
    expect(prompt!.choices[0].hint).toBe('fast');
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

  it('returns null when choices is missing', () => {
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
    expect(prompt!.choices[0].label).toBe('OK');
  });

  it('honours only the last valid directive when multiple are present', () => {
    const text = [
      '<!-- clawboy:options\n{"choices":[{"label":"First","value":"first"}]}\n-->',
      'Some more text',
      '<!-- clawboy:options\n{"choices":[{"label":"Second","value":"second"}]}\n-->',
    ].join('\n');
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt!.choices[0].label).toBe('Second');
    // Only the last directive is stripped; the first stays (still invisible in markdown).
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
// deriveSurveyState
// ---------------------------------------------------------------------------

const twoChoices = {
  choices: [
    { label: 'Yes', value: 'Yes please' },
    { label: 'No', value: 'No thanks' },
  ],
};

describe('deriveSurveyState', () => {
  it('returns consumed:false when nextUserText is null', () => {
    expect(deriveSurveyState(twoChoices, null)).toEqual({ consumed: false });
  });

  it('returns consumed:false when nextUserText is undefined', () => {
    expect(deriveSurveyState(twoChoices, undefined)).toEqual({ consumed: false });
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

  it('trims freetext in chosenFreeText', () => {
    const state = deriveSurveyState(twoChoices, '  custom reply  ');
    expect(state).toEqual({ consumed: true, chosenFreeText: 'custom reply' });
  });

  it('returns consumed:false when nextUserText is empty string (C3 regression)', () => {
    expect(deriveSurveyState(twoChoices, '')).toEqual({ consumed: false });
  });

  it('returns consumed:false when nextUserText is whitespace-only (C3 regression)', () => {
    expect(deriveSurveyState(twoChoices, '   ')).toEqual({ consumed: false });
  });
});

// ---------------------------------------------------------------------------
// stripClawboyOptionsForRender
// ---------------------------------------------------------------------------

describe('stripClawboyOptionsForRender', () => {
  it('returns text unchanged when no directive is present', () => {
    const text = 'Hello world';
    expect(stripClawboyOptionsForRender(text)).toBe(text);
  });

  it('strips a complete directive from the end of a message', () => {
    const text = 'Pick one:\n\n<!-- clawboy:options\n{"choices":[{"label":"A","value":"a"}]}\n-->';
    expect(stripClawboyOptionsForRender(text)).toBe('Pick one:');
  });

  it('strips an incomplete (still-streaming) directive', () => {
    const text = 'Some text\n\n<!-- clawboy:options\n{"choices":[{"la';
    expect(stripClawboyOptionsForRender(text)).toBe('Some text');
  });

  it('strips everything from the opening tag to end of string (aggressive)', () => {
    const text = 'Prose <!-- clawboy:options something trailing text';
    expect(stripClawboyOptionsForRender(text)).toBe('Prose');
  });

  it('is case-insensitive', () => {
    const text = 'Q\n<!-- CLAWBOY:OPTIONS\n{}\n-->';
    expect(stripClawboyOptionsForRender(text)).toBe('Q');
  });

  it('returns empty string when message is only the directive', () => {
    const text = '<!-- clawboy:options\n{"choices":[{"label":"A","value":"a"}]}\n-->';
    expect(stripClawboyOptionsForRender(text)).toBe('');
  });
});
