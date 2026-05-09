import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { InteractiveOptionsCard } from '../InteractiveOptionsCard';
import type { ClawboyOptionsPrompt } from '@/lib/openclaw/interactive';

// Provide a minimal i18n implementation so the component renders with real strings.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const strings: Record<string, string> = {
        'chat.options.youReplied': 'You replied:',
        'chat.options.defaultPlaceholder': 'Or type a custom reply\u2026',
        'chat.options.sendCustomReply': 'Send custom reply',
        'chat.options.sendSelectedReply': 'Send selected reply',
        'chat.options.choiceSelected': `${params?.label ?? ''} \u2014 selected`,
        'chat.options.choicePending': `${params?.label ?? ''} \u2014 selected, not sent`,
        'chat.options.choiceNotSelected': params?.label ?? '',
        'chat.options.choiceHint': `${params?.label ?? ''}: ${params?.hint ?? ''}`,
      };
      return strings[key] ?? key;
    },
    i18n: { language: 'en' },
  }),
}));

const basePrompt: ClawboyOptionsPrompt = {
  choices: [
    { label: 'PostgreSQL', value: 'Use PostgreSQL' },
    { label: 'SQLite', value: 'Use SQLite', hint: 'simpler, file-based' },
    { label: 'MySQL', value: 'Use MySQL' },
  ],
  allowFreeText: true,
};

const liveState = { consumed: false } as const;
const noop = () => {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function render(overrides: Partial<Parameters<typeof InteractiveOptionsCard>[0]> = {}) {
  const onPick = jest.fn();
  const onSubmitFreeText = jest.fn();
  const utils = renderWithProviders(
    <InteractiveOptionsCard
      prompt={basePrompt}
      surveyState={liveState}
      onPick={onPick}
      onSubmitFreeText={onSubmitFreeText}
      {...overrides}
    />,
  );
  return { ...utils, onPick, onSubmitFreeText };
}

// ---------------------------------------------------------------------------
// Core: pick behaviour
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — pick & send', () => {
  it('tapping a choice does NOT immediately call onPick', () => {
    const { getByText, onPick } = render();
    fireEvent.press(getByText('PostgreSQL'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('tapping send after picking a choice calls onPick once with the correct value', () => {
    const { getByText, getByLabelText, onPick } = render();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByLabelText('Send custom reply'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('Use PostgreSQL');
  });

  it('switching choices then sending uses the last picked value', () => {
    const { getByText, getByLabelText, onPick } = render();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByText('MySQL'));
    fireEvent.press(getByLabelText('Send custom reply'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('Use MySQL');
  });

  it('tapping the same choice twice deselects it so send does nothing', () => {
    const { getByText, getByLabelText, onPick } = render();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.press(getByText('PostgreSQL'));
    // handleSend guards on canSend, which is false after deselection.
    fireEvent.press(getByLabelText('Send custom reply'));
    expect(onPick).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Free-text behaviour
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — free-text', () => {
  it('typing in the free-text input clears the selected choice', () => {
    const { getByText, getByLabelText, getByPlaceholderText, onPick, onSubmitFreeText } = render();
    fireEvent.press(getByText('PostgreSQL'));
    fireEvent.changeText(getByPlaceholderText('Or type a custom reply\u2026'), 'Something custom');
    fireEvent.press(getByLabelText('Send custom reply'));
    expect(onPick).not.toHaveBeenCalled();
    expect(onSubmitFreeText).toHaveBeenCalledWith('Something custom');
  });

  it('free-text send prefers the typed value even when a choice was picked first', () => {
    const { getByText, getByPlaceholderText, getByLabelText, onSubmitFreeText } = render();
    fireEvent.press(getByText('MySQL'));
    fireEvent.changeText(getByPlaceholderText('Or type a custom reply\u2026'), 'DynamoDB please');
    fireEvent.press(getByLabelText('Send custom reply'));
    expect(onSubmitFreeText).toHaveBeenCalledWith('DynamoDB please');
  });

  it('send does nothing before any choice or text is entered', () => {
    const { getByLabelText, onPick, onSubmitFreeText } = render();
    // Button is rendered but disabled — handleSend returns early.
    fireEvent.press(getByLabelText('Send custom reply'));
    expect(onPick).not.toHaveBeenCalled();
    expect(onSubmitFreeText).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// allowFreeText: false — send-only footer
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — allowFreeText: false', () => {
  const noFreeTextPrompt: ClawboyOptionsPrompt = {
    ...basePrompt,
    allowFreeText: false,
  };

  it('renders a send-only footer row with no text input', () => {
    const { queryByPlaceholderText, queryByLabelText } = renderWithProviders(
      <InteractiveOptionsCard
        prompt={noFreeTextPrompt}
        surveyState={liveState}
        onPick={noop}
        onSubmitFreeText={noop}
      />,
    );
    // Free-text input should not be present.
    expect(queryByPlaceholderText('Or type a custom reply\u2026')).toBeNull();
    // Send-only button should be present.
    expect(queryByLabelText('Send selected reply')).not.toBeNull();
  });

  it('send-only button does nothing before a choice is picked', () => {
    const onPick = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <InteractiveOptionsCard
        prompt={noFreeTextPrompt}
        surveyState={liveState}
        onPick={onPick}
        onSubmitFreeText={noop}
      />,
    );
    fireEvent.press(getByLabelText('Send selected reply'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('send-only button fires onPick after picking a choice', () => {
    const onPick = jest.fn();
    const { getByText, getByLabelText } = renderWithProviders(
      <InteractiveOptionsCard
        prompt={noFreeTextPrompt}
        surveyState={liveState}
        onPick={onPick}
        onSubmitFreeText={noop}
      />,
    );
    fireEvent.press(getByText('MySQL'));
    fireEvent.press(getByLabelText('Send selected reply'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('Use MySQL');
  });
});

// ---------------------------------------------------------------------------
// Consumed state — card is frozen
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — consumed state', () => {
  it('does not fire onPick when consumed and a choice row is pressed', () => {
    const onPick = jest.fn();
    const { getByText } = renderWithProviders(
      <InteractiveOptionsCard
        prompt={basePrompt}
        surveyState={{ consumed: true, chosenValue: 'Use PostgreSQL' }}
        onPick={onPick}
        onSubmitFreeText={noop}
      />,
    );
    fireEvent.press(getByText('PostgreSQL'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('renders the "You replied:" quote pill when consumed with a free-text reply', () => {
    const { getByText } = renderWithProviders(
      <InteractiveOptionsCard
        prompt={basePrompt}
        surveyState={{ consumed: true, chosenFreeText: 'I prefer DynamoDB' }}
        onPick={noop}
        onSubmitFreeText={noop}
      />,
    );
    expect(getByText('You replied:')).toBeTruthy();
    expect(getByText('I prefer DynamoDB')).toBeTruthy();
  });

  it('does not render the quote pill when consumed via a choice (not free-text)', () => {
    const { queryByText } = renderWithProviders(
      <InteractiveOptionsCard
        prompt={basePrompt}
        surveyState={{ consumed: true, chosenValue: 'Use PostgreSQL' }}
        onPick={noop}
        onSubmitFreeText={noop}
      />,
    );
    expect(queryByText('You replied:')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// disabled prop — card is temporarily non-interactive
// ---------------------------------------------------------------------------

describe('InteractiveOptionsCard — disabled prop', () => {
  it('choice tap does not update selection when disabled', () => {
    const onPick = jest.fn();
    const { getByText, getByLabelText } = renderWithProviders(
      <InteractiveOptionsCard
        prompt={basePrompt}
        surveyState={liveState}
        disabled
        onPick={onPick}
        onSubmitFreeText={noop}
      />,
    );
    fireEvent.press(getByText('PostgreSQL'));
    // Send button is disabled too; pressing it must not call onPick.
    fireEvent.press(getByLabelText('Send custom reply'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('free-text input is not editable when disabled', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <InteractiveOptionsCard
        prompt={basePrompt}
        surveyState={liveState}
        disabled
        onPick={noop}
        onSubmitFreeText={noop}
      />,
    );
    const input = getByPlaceholderText('Or type a custom reply\u2026');
    expect(input.props.editable).toBe(false);
  });
});
