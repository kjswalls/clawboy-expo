import {
  parseClawboyOptions,
  parseClawboyAnswers,
  composeAnswersMessage,
  stripClawboyDirectivesForRender,
  stripClawboyAnswersForRender,
  hasClawboyOptionsDirective,
  hasClawboyAnswersDirective,
  deriveMultiSurveyState,
  normalizeToQuestions,
} from '../interactive';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLinkrefOptions(json: object): string {
  return `[clawboy-options]: <data:application/json;base64,${btoa(JSON.stringify(json))}>`;
}

function makeLinkrefAnswers(json: object): string {
  return `[clawboy-answers]: <data:application/json;base64,${btoa(JSON.stringify(json))}>`;
}

const SINGLE_CHOICE_PAYLOAD = {
  choices: [
    { label: 'Yes', value: 'Yes please' },
    { label: 'No', value: 'No thanks' },
  ],
};

const MULTI_QUESTION_PAYLOAD = {
  questions: [
    {
      id: 'q1',
      prompt: 'First question?',
      choices: [
        { label: 'Option A', value: 'a' },
        { label: 'Option B', value: 'b' },
      ],
    },
    {
      id: 'q2',
      prompt: 'Second question?',
      choices: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
      allowFreeText: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// parseClawboyOptions — link-ref form (primary)
// ---------------------------------------------------------------------------

describe('parseClawboyOptions — link-ref form', () => {
  test('single-question link-ref', () => {
    const text = `Here is the answer.\n\n${makeLinkrefOptions(SINGLE_CHOICE_PAYLOAD)}`;
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt).not.toBeNull();
    expect(normalizeToQuestions(prompt!)[0]?.choices).toHaveLength(2);
    expect(cleanText).toBe('Here is the answer.');
    expect(cleanText).not.toContain('[clawboy-options]');
  });

  test('multi-question link-ref', () => {
    const text = `Prose.\n\n${makeLinkrefOptions(MULTI_QUESTION_PAYLOAD)}`;
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt).not.toBeNull();
    expect(normalizeToQuestions(prompt!)).toHaveLength(2);
    expect(cleanText).toBe('Prose.');
  });

  test('malformed base64 falls through gracefully', () => {
    const text = 'Prose.\n\n[clawboy-options]: <data:application/json;base64,!!!BAD!!!>';
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt).toBeNull();
  });

  test('valid base64 but invalid JSON returns null prompt', () => {
    const text = `Prose.\n\n[clawboy-options]: <data:application/json;base64,${btoa('not json')}>`;
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt).toBeNull();
  });

  test('link-ref with no choices returns null prompt', () => {
    const text = `Prose.\n\n${makeLinkrefOptions({ choices: [] })}`;
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseClawboyOptions — legacy HTML-comment form (backward compat)
// ---------------------------------------------------------------------------

describe('parseClawboyOptions — legacy HTML-comment form', () => {
  test('single-question HTML comment', () => {
    const comment = `<!-- clawboy:options\n${JSON.stringify(SINGLE_CHOICE_PAYLOAD)}\n-->`;
    const text = `Here is the answer.\n\n${comment}`;
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt).not.toBeNull();
    expect(cleanText).toBe('Here is the answer.');
  });

  test('multi-question HTML comment', () => {
    const comment = `<!-- clawboy:options\n${JSON.stringify(MULTI_QUESTION_PAYLOAD)}\n-->`;
    const text = `Prose.\n\n${comment}`;
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt).not.toBeNull();
    expect(normalizeToQuestions(prompt!)).toHaveLength(2);
    expect(cleanText).toBe('Prose.');
  });

  test('malformed HTML-comment JSON returns null prompt, text unchanged', () => {
    const text = '<!-- clawboy:options\nnot json\n-->';
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt).toBeNull();
    expect(cleanText).toBe(text);
  });

  test('no directive returns text unchanged', () => {
    const text = 'Just some prose.';
    const { cleanText, prompt } = parseClawboyOptions(text);
    expect(prompt).toBeNull();
    expect(cleanText).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// stripClawboyDirectivesForRender
// ---------------------------------------------------------------------------

describe('stripClawboyDirectivesForRender', () => {
  test('strips link-ref options directive', () => {
    const text = `Prose.\n\n${makeLinkrefOptions(SINGLE_CHOICE_PAYLOAD)}`;
    expect(stripClawboyDirectivesForRender(text)).toBe('Prose.');
  });

  test('strips legacy HTML-comment options directive', () => {
    const comment = `<!-- clawboy:options\n${JSON.stringify(SINGLE_CHOICE_PAYLOAD)}\n-->`;
    expect(stripClawboyDirectivesForRender(`Prose.\n\n${comment}`)).toBe('Prose.');
  });

  test('strips partial/streaming link-ref', () => {
    const partial = 'Prose.\n\n[clawboy-options]: <data:application/json;base64,eyJ';
    const result = stripClawboyDirectivesForRender(partial);
    expect(result).not.toContain('[clawboy-options]');
  });

  test('strips partial/streaming HTML comment', () => {
    const partial = 'Prose.\n\n<!-- clawboy:options\n{"choices":';
    const result = stripClawboyDirectivesForRender(partial);
    expect(result).not.toContain('clawboy:options');
  });

  test('returns unchanged text when no directive', () => {
    const text = 'Just prose.';
    expect(stripClawboyDirectivesForRender(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// hasClawboyOptionsDirective / hasClawboyAnswersDirective
// ---------------------------------------------------------------------------

describe('hasClawboyOptionsDirective', () => {
  test('detects link-ref form', () => {
    expect(hasClawboyOptionsDirective('[clawboy-options]: <data:...>')).toBe(true);
  });
  test('detects legacy HTML comment form', () => {
    expect(hasClawboyOptionsDirective('<!-- clawboy:options {} -->')).toBe(true);
  });
  test('returns false for unrelated text', () => {
    expect(hasClawboyOptionsDirective('hello world')).toBe(false);
  });
});

describe('hasClawboyAnswersDirective', () => {
  test('detects link-ref form', () => {
    expect(hasClawboyAnswersDirective('[clawboy-answers]: <data:...>')).toBe(true);
  });
  test('detects legacy HTML comment form', () => {
    expect(hasClawboyAnswersDirective('<!-- clawboy:answers {} -->')).toBe(true);
  });
  test('returns false for unrelated text', () => {
    expect(hasClawboyAnswersDirective('hello world')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// composeAnswersMessage + parseClawboyAnswers round-trip
// ---------------------------------------------------------------------------

describe('composeAnswersMessage + parseClawboyAnswers round-trip', () => {
  test('single-question round-trip via link-ref', () => {
    const composed = composeAnswersMessage(SINGLE_CHOICE_PAYLOAD, { _single: 'Yes please' });
    expect(composed).toContain('[clawboy-answers]:');
    expect(composed).toContain('data:application/json;base64,');
    // Human-readable summary preserved
    expect(composed).toContain('Question 1: Yes');

    const parsed = parseClawboyAnswers(composed);
    expect(parsed).not.toBeNull();
    expect(parsed!._single).toBe('Yes please');
  });

  test('multi-question round-trip via link-ref', () => {
    const prompt = MULTI_QUESTION_PAYLOAD;
    const answers = { q1: 'a', q2: null };
    const composed = composeAnswersMessage(prompt, answers);

    const parsed = parseClawboyAnswers(composed);
    expect(parsed).not.toBeNull();
    expect(parsed!.q1).toBe('a');
    expect(parsed!.q2).toBeNull();
  });

  test('skipped answer (null) round-trips correctly', () => {
    const composed = composeAnswersMessage(SINGLE_CHOICE_PAYLOAD, { _single: null });
    const parsed = parseClawboyAnswers(composed);
    expect(parsed!._single).toBeNull();
    expect(composed).toContain('(skipped)');
  });
});

// ---------------------------------------------------------------------------
// parseClawboyAnswers — legacy HTML-comment form
// ---------------------------------------------------------------------------

describe('parseClawboyAnswers — legacy form', () => {
  test('parses legacy HTML-comment answers', () => {
    const legacy = '<!-- clawboy:answers\n{"_single":"Yes please"}\n-->\n\n1. Question 1: Yes';
    const parsed = parseClawboyAnswers(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed!._single).toBe('Yes please');
  });

  test('returns null for missing directive', () => {
    expect(parseClawboyAnswers('just prose')).toBeNull();
  });

  test('returns null for malformed JSON in legacy form', () => {
    expect(parseClawboyAnswers('<!-- clawboy:answers not json -->')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stripClawboyAnswersForRender
// ---------------------------------------------------------------------------

describe('stripClawboyAnswersForRender', () => {
  test('strips link-ref answers, preserves summary', () => {
    const composed = composeAnswersMessage(SINGLE_CHOICE_PAYLOAD, { _single: 'Yes please' });
    const stripped = stripClawboyAnswersForRender(composed);
    expect(stripped).not.toContain('[clawboy-answers]');
    expect(stripped).toContain('Question 1: Yes');
  });

  test('strips legacy HTML-comment answers, preserves summary', () => {
    const text =
      '<!-- clawboy:answers\n{"_single":"Yes please"}\n-->\n\n1. Question 1: Yes';
    const stripped = stripClawboyAnswersForRender(text);
    expect(stripped).not.toContain('clawboy:answers');
    expect(stripped).toContain('Question 1: Yes');
  });

  test('no-op on text without answers directive', () => {
    const text = 'Just prose.';
    expect(stripClawboyAnswersForRender(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// deriveMultiSurveyState
// ---------------------------------------------------------------------------

describe('deriveMultiSurveyState', () => {
  test('derives consumed state from link-ref answers', () => {
    const composed = composeAnswersMessage(MULTI_QUESTION_PAYLOAD, {
      q1: 'a',
      q2: 'yes',
    });
    const states = deriveMultiSurveyState(MULTI_QUESTION_PAYLOAD, composed);
    expect(states.q1).toEqual({ consumed: true, chosenValue: 'a' });
    expect(states.q2).toEqual({ consumed: true, chosenValue: 'yes' });
  });

  test('derives consumed state from legacy HTML-comment answers', () => {
    const legacy =
      '<!-- clawboy:answers\n{"q1":"a","q2":"yes"}\n-->\n\n1. First: Option A\n2. Second: Yes';
    const states = deriveMultiSurveyState(MULTI_QUESTION_PAYLOAD, legacy);
    expect(states.q1?.consumed).toBe(true);
    expect(states.q2?.consumed).toBe(true);
  });

  test('returns all live when nextUserText is null', () => {
    const states = deriveMultiSurveyState(MULTI_QUESTION_PAYLOAD, null);
    expect(states.q1).toEqual({ consumed: false });
    expect(states.q2).toEqual({ consumed: false });
  });

  test('marks skipped as consumed:true with no chosenValue or chosenFreeText', () => {
    const composed = composeAnswersMessage(MULTI_QUESTION_PAYLOAD, { q1: 'a', q2: null });
    const states = deriveMultiSurveyState(MULTI_QUESTION_PAYLOAD, composed);
    const q2 = states.q2 as { consumed: true; chosenValue?: string; chosenFreeText?: string };
    expect(q2.consumed).toBe(true);
    expect(q2.chosenValue).toBeUndefined();
    expect(q2.chosenFreeText).toBeUndefined();
  });
});
