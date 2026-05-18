import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { InteractiveOptionsCard } from '../InteractiveOptionsCard';
import type { ClawboyOptionsPrompt, MultiSurveyStates } from '@/lib/openclaw/interactive';
import {
  composeAnswersMessage,
  deriveMultiSurveyState,
  parseClawboyAnswers,
  summarizeAnswersForCollapse,
} from '@/lib/openclaw/interactive';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const strings: Record<string, string> = {
        'chat.options.youReplied': 'You replied:',
        'chat.options.defaultPlaceholder': 'Or type a custom reply\u2026',
        'chat.options.sendCustomReply': 'Send custom reply',
        'chat.options.sendSelectedReply': 'Send selected reply',
        'chat.options.sendAnswers': 'Send',
        'chat.options.choiceSelected': `${params?.label ?? ''} \u2014 selected`,
        'chat.options.choicePending': `${params?.label ?? ''} \u2014 selected, not sent`,
        'chat.options.choiceNotSelected': params?.label ?? '',
        'chat.options.choiceHint': `${params?.label ?? ''}: ${params?.hint ?? ''}`,
        'chat.options.questionCounter': `${params?.current ?? ''} of ${params?.total ?? ''}`,
        'chat.options.prevQuestion': 'Previous question',
        'chat.options.nextQuestion': 'Next question',
        'chat.options.skipped': '(skipped)',
        'chat.options.skip': 'Skip',
        'chat.options.skipQuestion': 'Skip this question',
        'chat.options.clear': 'Clear',
        'chat.options.replyLabel': 'Reply',
        'chat.options.questionHeader': 'Question',
        'chat.options.questionsHeader': 'Questions',
      };
      return strings[key] ?? key;
    },
    i18n: { language: 'en' },
  }),
}));

// ---------------------------------------------------------------------------
// Single-question prompt (backward-compat: choices[] form)
// ---------------------------------------------------------------------------

const singlePrompt: ClawboyOptionsPrompt = {
  choices: [
    { label: 'PostgreSQL', value: 'Use PostgreSQL' },
    { label: 'SQLite', value: 'Use SQLite', hint: 'simpler, file-based' },
    { label: 'MySQL', value: 'Use MySQL' },
  ],
  allowFreeText: true,
};

const liveStates: MultiSurveyStates = { _single: { consumed: false } };

function renderSingle(overrides: Partial<Parameters<typeof InteractiveOptionsCard>[0]> = {}) {
  const onSubmitMultiReply = jest.fn();
  const utils = renderWithProviders(
    <InteractiveOptionsCard
      prompt={singlePrompt}
      surveyStates={liveStates}
      onSubmitMultiReply={onSubmitMultiReply}
      {...overrides}
    />,
  );
  return { ...utils, onSubmitMultiReply };
}

// ---------------------------------------------------------------------------
// Single-question: pick and send
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — single-question pick & send', () => {
  it('tapping a choice does NOT immediately call onSubmitMultiReply', () => {
    const { getByText, onSubmitMultiReply } = renderSingle();
    fireEvent.press(getByText('PostgreSQL'));
    expect(onSubmitMultiReply).not.toHaveBeenCalled();
  });

  it('tapping send after picking a choice calls onSubmitMultiReply once', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderSingle();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByLabelText('Send'));
    expect(onSubmitMultiReply).toHaveBeenCalledTimes(1);
    // The raw message should contain the chosen value in the clawboy:answers block.
    const raw: string = onSubmitMultiReply.mock.calls[0][0];
    const parsed = parseClawboyAnswers(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!['_single']).toBe('Use PostgreSQL');
  });

  it('switching choices then sending uses the last picked value', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderSingle();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByText('MySQL'));
    fireEvent.press(getByLabelText('Send'));
    const raw: string = onSubmitMultiReply.mock.calls[0][0];
    const parsed = parseClawboyAnswers(raw);
    expect(parsed!['_single']).toBe('Use MySQL');
  });

  it('tapping the same choice twice deselects it so send does nothing', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderSingle();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByLabelText('Send'));
    expect(onSubmitMultiReply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Single-question: free-text
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — single-question free-text', () => {
  it('typing clears the selected choice; send uses the typed text', () => {
    const { getByText, getByPlaceholderText, getByLabelText, onSubmitMultiReply } = renderSingle();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.changeText(getByPlaceholderText('Or type a custom reply\u2026'), 'Something custom');
    fireEvent.press(getByLabelText('Send'));
    const raw: string = onSubmitMultiReply.mock.calls[0][0];
    const parsed = parseClawboyAnswers(raw);
    expect(parsed!['_single']).toBe('Something custom');
  });

  it('send does nothing before any choice or text is entered', () => {
    const { getByLabelText, onSubmitMultiReply } = renderSingle();
    fireEvent.press(getByLabelText('Send'));
    expect(onSubmitMultiReply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Single-question: consumed state (card frozen)
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — single-question consumed state', () => {
  it('does not fire onSubmitMultiReply when consumed and a choice row is pressed', () => {
    const { getAllByText, onSubmitMultiReply } = renderSingle({
      surveyStates: { _single: { consumed: true, chosenValue: 'Use PostgreSQL' } },
    });
    // "PostgreSQL" appears in both the measurement ghost and the animated body.
    fireEvent.press(getAllByText('PostgreSQL')[0]);
    expect(onSubmitMultiReply).not.toHaveBeenCalled();
  });

  it('renders the "You replied:" quote pill when consumed with a free-text reply', () => {
    const { getAllByText } = renderSingle({
      surveyStates: { _single: { consumed: true, chosenFreeText: 'I prefer DynamoDB' } },
    });
    expect(getAllByText('You replied:').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('I prefer DynamoDB').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render the quote pill when consumed via a choice', () => {
    const { queryByText } = renderSingle({
      surveyStates: { _single: { consumed: true, chosenValue: 'Use PostgreSQL' } },
    });
    expect(queryByText('You replied:')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End-to-end: raw answers directive on the next user message renders the
// parsed reply, not the transport payload. Regression for the bug where
// `[clawboy-answers]: <data:application/json;base64,…>` leaked into the
// "You replied:" pill because deriveMultiSurveyState fell through to its
// fallback path on already-stripped content.
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — raw answers directive end-to-end', () => {
  it('renders the parsed free-text answer (not the raw data: URI) when surveyStates is derived from the raw composed message', () => {
    const raw = composeAnswersMessage(singlePrompt, { _single: 'Not right now' });
    expect(raw).toMatch(/^\[clawboy-answers\]:\s*<data:application\/json;base64,/);

    const surveyStates = deriveMultiSurveyState(singlePrompt, raw);
    const { getAllByText, queryByText } = renderSingle({ surveyStates });

    expect(getAllByText('You replied:').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Not right now').length).toBeGreaterThanOrEqual(1);
    expect(queryByText(/data:application\/json;base64/)).toBeNull();
    expect(queryByText(/clawboy-answers/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Single-question: disabled prop
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — disabled prop', () => {
  it('choice tap does not enable Send when disabled', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderSingle({ disabled: true });
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByLabelText('Send'));
    expect(onSubmitMultiReply).not.toHaveBeenCalled();
  });

  it('free-text input is not editable when disabled', () => {
    const { getByPlaceholderText } = renderSingle({ disabled: true });
    const input = getByPlaceholderText('Or type a custom reply\u2026');
    expect(input.props.editable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-question: navigation and state
// ---------------------------------------------------------------------------

const multiPrompt: ClawboyOptionsPrompt = {
  questions: [
    {
      id: 'q1',
      prompt: 'First question?',
      choices: [{ label: 'Alpha', value: 'alpha' }, { label: 'Beta', value: 'beta' }],
      allowFreeText: true,
    },
    {
      id: 'q2',
      prompt: 'Second question?',
      choices: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
      allowFreeText: false,
    },
  ],
};

const multiLiveStates: MultiSurveyStates = {
  q1: { consumed: false },
  q2: { consumed: false },
};

function renderMulti(overrides: Partial<Parameters<typeof InteractiveOptionsCard>[0]> = {}) {
  const onSubmitMultiReply = jest.fn();
  const utils = renderWithProviders(
    <InteractiveOptionsCard
      prompt={multiPrompt}
      surveyStates={multiLiveStates}
      onSubmitMultiReply={onSubmitMultiReply}
      {...overrides}
    />,
  );
  return { ...utils, onSubmitMultiReply };
}

describe('InteractiveOptionsCard — multi-question navigation', () => {
  it('renders "1 of 2" counter when two questions are present', () => {
    const { getByText } = renderMulti();
    expect(getByText('1 of 2')).toBeTruthy();
  });

  it('shows the first question\'s prompt initially', () => {
    const { getByText } = renderMulti();
    expect(getByText('First question?')).toBeTruthy();
  });

  it('navigates to next question on ChevronDown press', () => {
    const { getByLabelText, getByText } = renderMulti();
    fireEvent.press(getByLabelText('Next question'));
    expect(getByText('2 of 2')).toBeTruthy();
    expect(getByText('Second question?')).toBeTruthy();
  });

  it('navigates back on ChevronUp press', () => {
    const { getByLabelText, getByText } = renderMulti();
    fireEvent.press(getByLabelText('Next question'));
    fireEvent.press(getByLabelText('Previous question'));
    expect(getByText('1 of 2')).toBeTruthy();
  });
});

describe('InteractiveOptionsCard — multi-question send', () => {
  it('send is disabled when no question has been answered', () => {
    const { getByLabelText, onSubmitMultiReply } = renderMulti();
    fireEvent.press(getByLabelText('Send'));
    expect(onSubmitMultiReply).not.toHaveBeenCalled();
  });

  it('send is enabled after answering any question; skipped questions are null in payload', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderMulti();
    // Answer only q1 (on page 1).
    fireEvent.press(getByText('Alpha'));
    fireEvent.press(getByLabelText('Send'));
    expect(onSubmitMultiReply).toHaveBeenCalledTimes(1);
    const raw: string = onSubmitMultiReply.mock.calls[0][0];
    const parsed = parseClawboyAnswers(raw);
    expect(parsed!['q1']).toBe('alpha');
    expect(parsed!['q2']).toBeNull();
  });

  it('composes correct answers when both questions are answered', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderMulti();
    // Answer q1.
    fireEvent.press(getByText('Beta'));
    // Navigate to q2 and answer.
    fireEvent.press(getByLabelText('Next question'));
    fireEvent.press(getByText('Yes'));
    fireEvent.press(getByLabelText('Send'));
    const raw: string = onSubmitMultiReply.mock.calls[0][0];
    const parsed = parseClawboyAnswers(raw);
    expect(parsed!['q1']).toBe('beta');
    expect(parsed!['q2']).toBe('yes');
  });

  it('includes human-readable summary lines in the sent message', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderMulti();
    fireEvent.press(getByText('Alpha'));
    fireEvent.press(getByLabelText('Send'));
    const raw: string = onSubmitMultiReply.mock.calls[0][0];
    expect(raw).toContain('1. First question?: Alpha');
    expect(raw).toContain('2. Second question?: (skipped)');
  });
});

// ---------------------------------------------------------------------------
// Multi-question: Chevron Controls
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — multi-question Chevron Controls', () => {
  it('renders both Previous and Next chevron buttons in multi-Q live mode', () => {
    const { getByLabelText } = renderMulti();
    expect(getByLabelText('Previous question')).toBeTruthy();
    expect(getByLabelText('Next question')).toBeTruthy();
  });

  it('Next chevron advances to the next question (1→2)', () => {
    const { getByLabelText, getByText } = renderMulti();
    fireEvent.press(getByLabelText('Next question'));
    expect(getByText('2 of 2')).toBeTruthy();
    expect(getByText('Second question?')).toBeTruthy();
  });

  it('Previous chevron navigates back from last question to first', () => {
    const { getByLabelText, getByText } = renderMulti();
    // Navigate to last question first.
    fireEvent.press(getByLabelText('Next question'));
    expect(getByText('2 of 2')).toBeTruthy();
    // Previous should return to q1.
    fireEvent.press(getByLabelText('Previous question'));
    expect(getByText('1 of 2')).toBeTruthy();
  });

  it('chevron navigation preserves answers already made on other questions', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderMulti();
    // Answer q1, then navigate to q2.
    fireEvent.press(getByText('Alpha'));
    fireEvent.press(getByLabelText('Next question'));
    // Answer q2 and send.
    fireEvent.press(getByText('Yes'));
    fireEvent.press(getByLabelText('Send'));
    const raw: string = onSubmitMultiReply.mock.calls[0][0];
    const parsed = parseClawboyAnswers(raw);
    // q1 answer is preserved despite navigating away.
    expect(parsed!['q1']).toBe('alpha');
    expect(parsed!['q2']).toBe('yes');
  });

  it('does not render chevron navigation controls in single-Q mode', () => {
    const { queryByLabelText } = renderSingle();
    expect(queryByLabelText('Previous question')).toBeNull();
    expect(queryByLabelText('Next question')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Single-question: Clear button
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — single-question Clear', () => {
  it('Clear button is always rendered but disabled when no answer exists', () => {
    const { getByLabelText } = renderSingle();
    const clearBtn = getByLabelText('Clear');
    expect(clearBtn).toBeTruthy();
    expect(clearBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('Clear button is enabled after picking a choice', () => {
    const { getByText, getByLabelText } = renderSingle();
    fireEvent.press(getByText('PostgreSQL'));
    const clearBtn = getByLabelText('Clear');
    expect(clearBtn.props.accessibilityState?.disabled).toBe(false);
  });

  it('Clear button appears after entering free-text', () => {
    const { getByPlaceholderText, getByLabelText } = renderSingle();
    fireEvent.changeText(getByPlaceholderText('Or type a custom reply\u2026'), 'hello');
    expect(getByLabelText('Clear')).toBeTruthy();
  });

  it('tapping Clear resets the choice so Send becomes disabled again', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderSingle();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByLabelText('Clear'));
    // Send now disabled — pressing it does nothing.
    fireEvent.press(getByLabelText('Send'));
    expect(onSubmitMultiReply).not.toHaveBeenCalled();
  });

  it('tapping Clear leaves the Clear button visible but disabled again', () => {
    const { getByText, getByLabelText } = renderSingle();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByLabelText('Clear'));
    const clearBtn = getByLabelText('Clear');
    expect(clearBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('renders Clear button in multi-Q live mode', () => {
    const { getByLabelText } = renderMulti();
    expect(getByLabelText('Clear')).toBeTruthy();
  });

  it('Clear button is disabled in multi-Q when no question has been answered', () => {
    const { getByLabelText } = renderMulti();
    const clearBtn = getByLabelText('Clear');
    expect(clearBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('Clear button is enabled in multi-Q after answering a question', () => {
    const { getByText, getByLabelText } = renderMulti();
    fireEvent.press(getByText('Alpha'));
    expect(getByLabelText('Clear').props.accessibilityState?.disabled).toBe(false);
  });

  it('tapping Clear in multi-Q resets all answers and disables Send', () => {
    const { getByText, getByLabelText, onSubmitMultiReply } = renderMulti();
    fireEvent.press(getByText('Alpha'));
    fireEvent.press(getByLabelText('Clear'));
    fireEvent.press(getByLabelText('Send'));
    expect(onSubmitMultiReply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Single-question: header bar
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — single-question header bar', () => {
  it('shows "Question" label in the single-Q header', () => {
    const { getByText } = renderSingle();
    expect(getByText('Question')).toBeTruthy();
  });

  it('renders question.prompt inline in the body when provided', () => {
    const promptWithQuestion: ClawboyOptionsPrompt = {
      choices: [{ label: 'Yes', value: 'yes' }],
      prompt: 'Should we proceed?',
    };
    const { getByText } = renderWithProviders(
      <InteractiveOptionsCard
        prompt={promptWithQuestion}
        surveyStates={{ _single: { consumed: false } }}
        onSubmitMultiReply={jest.fn()}
      />,
    );
    expect(getByText('Should we proceed?')).toBeTruthy();
  });

  it('multi-Q header shows "Questions" label with counter and nav controls', () => {
    const { getByText, getByLabelText } = renderMulti();
    expect(getByText('Questions')).toBeTruthy();
    expect(getByText('1 of 2')).toBeTruthy();
    expect(getByLabelText('Previous question')).toBeTruthy();
    expect(getByLabelText('Next question')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Collapse / expand after submit
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — collapse on consume (single-Q)', () => {
  it('shows the chosen label in collapsed summary', () => {
    const { getAllByText } = renderSingle({
      surveyStates: { _single: { consumed: true, chosenValue: 'Use PostgreSQL' } },
    });
    expect(getAllByText('PostgreSQL').length).toBeGreaterThanOrEqual(1);
  });

  it('shows free-text reply in collapsed summary', () => {
    const { getAllByText } = renderSingle({
      surveyStates: { _single: { consumed: true, chosenFreeText: 'I prefer DynamoDB' } },
    });
    expect(getAllByText('I prefer DynamoDB').length).toBeGreaterThanOrEqual(1);
  });

  it('shows (skipped) in collapsed summary when no choice or free-text', () => {
    const { getAllByText } = renderSingle({
      surveyStates: { _single: { consumed: true } },
    });
    expect(getAllByText('(skipped)').length).toBeGreaterThanOrEqual(1);
  });

  it('tapping the header when consumed does not throw (header is interactive)', () => {
    const { getByText } = renderSingle({
      surveyStates: { _single: { consumed: true, chosenValue: 'Use PostgreSQL' } },
    });
    expect(() => fireEvent.press(getByText('Question'))).not.toThrow();
  });

  it('Send footer is not rendered when consumed', () => {
    const { queryByLabelText } = renderSingle({
      surveyStates: { _single: { consumed: true, chosenValue: 'Use PostgreSQL' } },
    });
    expect(queryByLabelText('Send')).toBeNull();
  });

  it('summary block renders and survives header toggle', () => {
    const { getByTestId, getByText } = renderSingle({
      surveyStates: { _single: { consumed: true, chosenValue: 'Use PostgreSQL' } },
    });
    expect(getByTestId('options-summary-block')).toBeTruthy();
    fireEvent.press(getByText('Question'));
    expect(getByTestId('options-summary-block')).toBeTruthy();
  });
});

describe('InteractiveOptionsCard — collapse on consume (multi-Q)', () => {
  const consumedMultiStates: MultiSurveyStates = {
    q1: { consumed: true, chosenValue: 'alpha' },
    q2: { consumed: true, chosenValue: 'yes' },
  };

  it('shows each question\'s selected label in collapsed summary', () => {
    const { getAllByText } = renderMulti({ surveyStates: consumedMultiStates });
    expect(getAllByText('Alpha').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Yes').length).toBeGreaterThanOrEqual(1);
  });

  it('nav chevrons are hidden when collapsed', () => {
    const { queryByLabelText } = renderMulti({ surveyStates: consumedMultiStates });
    expect(queryByLabelText('Previous question')).toBeNull();
    expect(queryByLabelText('Next question')).toBeNull();
  });

  it('tapping header expands card and reveals nav chevrons', () => {
    const { getAllByText, getByLabelText } = renderMulti({ surveyStates: consumedMultiStates });
    // Tap the "Questions" header to expand — use first match (header text).
    fireEvent.press(getAllByText('Questions')[0]);
    expect(getByLabelText('Previous question')).toBeTruthy();
    expect(getByLabelText('Next question')).toBeTruthy();
  });

  it('tapping header again collapses card and hides nav chevrons', () => {
    const { getAllByText, queryByLabelText } = renderMulti({ surveyStates: consumedMultiStates });
    fireEvent.press(getAllByText('Questions')[0]);
    fireEvent.press(getAllByText('Questions')[0]);
    expect(queryByLabelText('Previous question')).toBeNull();
    expect(queryByLabelText('Next question')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// summarizeAnswersForCollapse — unit tests for the collapse summary helper
// ---------------------------------------------------------------------------

describe('summarizeAnswersForCollapse (via import)', () => {
  const singlePromptForSummary: ClawboyOptionsPrompt = {
    choices: [
      { label: 'PostgreSQL', value: 'Use PostgreSQL' },
      { label: 'SQLite', value: 'Use SQLite' },
    ],
  };

  it('single-Q: chosen label', () => {
    expect(
      summarizeAnswersForCollapse(singlePromptForSummary, { _single: { consumed: true, chosenValue: 'Use PostgreSQL' } }),
    ).toBe('PostgreSQL');
  });

  it('single-Q: free-text reply', () => {
    expect(
      summarizeAnswersForCollapse(singlePromptForSummary, { _single: { consumed: true, chosenFreeText: 'Custom value' } }),
    ).toBe('Custom value');
  });

  it('single-Q: skipped', () => {
    expect(
      summarizeAnswersForCollapse(singlePromptForSummary, { _single: { consumed: true } }),
    ).toBe('(skipped)');
  });
});

describe('InteractiveOptionsCard — multi-question consumed state', () => {
  it('locks the card when any question is consumed; Send is gone', () => {
    const { onSubmitMultiReply, queryByLabelText } = renderMulti({
      surveyStates: {
        q1: { consumed: true, chosenValue: 'alpha' },
        q2: { consumed: true },
      },
    });
    expect(queryByLabelText('Send')).toBeNull();
    expect(onSubmitMultiReply).not.toHaveBeenCalled();
  });

  it('nav chevrons are hidden when consumed and collapsed', () => {
    const { queryByLabelText } = renderMulti({
      surveyStates: {
        q1: { consumed: true, chosenValue: 'alpha' },
        q2: { consumed: true },
      },
    });
    expect(queryByLabelText('Previous question')).toBeNull();
    expect(queryByLabelText('Next question')).toBeNull();
  });

  it('shows each question summary in collapsed view for multi-Q consumed', () => {
    const { getAllByText } = renderMulti({
      surveyStates: {
        q1: { consumed: true, chosenValue: 'alpha' },
        q2: { consumed: true },
      },
    });
    // CollapsedSummary renders all questions stacked
    expect(getAllByText('Alpha').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('(skipped)').length).toBeGreaterThanOrEqual(1);
  });
});
