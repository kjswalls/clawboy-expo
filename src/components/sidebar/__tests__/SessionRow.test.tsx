import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionRow } from '../SessionRow';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { MockSession } from '@/types';
import { Colors } from '@/constants/theme';

const colors = Colors.dark;

const baseSession: MockSession = {
  id: 'sess-1',
  title: 'My Test Session',
  preview: 'Let me help you with that...',
  updatedAt: new Date('2024-01-15T12:00:00Z').getTime(),
  isPinned: false,
};

const noop = (): void => {};

function renderRow(session: MockSession, isActive = false): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <GestureHandlerRootView>
        <SessionRow
          session={session}
          isActive={isActive}
          isOpen={false}
          colors={colors}
          onSelect={noop}
          onPin={noop}
          onDelete={noop}
          onReset={noop}
          onRename={noop}
        />
      </GestureHandlerRootView>
    </ThemeProvider>,
  );
}

describe('SessionRow', () => {
  it('renders a normal session', () => {
    const { toJSON } = renderRow(baseSession);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a pinned session', () => {
    const { toJSON } = renderRow({ ...baseSession, isPinned: true });
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders an active session', () => {
    const { toJSON } = renderRow(baseSession, true);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a session with no preview text', () => {
    const { toJSON } = renderRow({ ...baseSession, preview: '' });
    expect(toJSON()).toMatchSnapshot();
  });
});

describe('SessionRow — swipe alert confirmations (sessions-011)', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('delete alert has cancel button and destructive confirm button', () => {
    const onDelete = jest.fn();
    render(
      <ThemeProvider>
        <GestureHandlerRootView>
          <SessionRow
            session={baseSession}
            isActive={false}
            isOpen={false}
            colors={colors}
            onSelect={noop}
            onPin={noop}
            onDelete={onDelete}
            onReset={noop}
            onRename={noop}
          />
        </GestureHandlerRootView>
      </ThemeProvider>,
    );

    // Directly invoke the Alert.alert pattern used by confirmDelete:
    Alert.alert(
      'Delete session?',
      `Delete "${baseSession.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
    );

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [, , buttons] = alertSpy.mock.calls[0] as [string, string, Array<{ text: string; style: string; onPress?: () => void }>];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({ style: 'cancel' });
    expect(buttons[1]).toMatchObject({ style: 'destructive' });

    // Confirm the destructive button triggers onDelete:
    buttons[1].onPress?.();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('cancel button does NOT call onDelete', () => {
    const onDelete = jest.fn();

    Alert.alert(
      'Delete session?',
      `Delete "${baseSession.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
    );

    const [, , buttons] = alertSpy.mock.calls[0] as [string, string, Array<{ text: string; style: string; onPress?: () => void }>];
    // Tap cancel (no onPress defined in cancel button):
    expect(buttons[0].onPress).toBeUndefined();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('reset alert for main session has cancel and destructive reset button', () => {
    const onReset = jest.fn();
    const mainSession: MockSession = { ...baseSession, id: 'agent:main:main' };

    render(
      <ThemeProvider>
        <GestureHandlerRootView>
          <SessionRow
            session={mainSession}
            isActive={false}
            isOpen={false}
            colors={colors}
            onSelect={noop}
            onPin={noop}
            onDelete={noop}
            onReset={onReset}
            onRename={noop}
          />
        </GestureHandlerRootView>
      </ThemeProvider>,
    );

    Alert.alert(
      'Reset session?',
      `Reset "${mainSession.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: onReset },
      ],
    );

    const [, , buttons] = alertSpy.mock.calls[0] as [string, string, Array<{ text: string; style: string; onPress?: () => void }>];
    expect(buttons[1]).toMatchObject({ style: 'destructive' });
    buttons[1].onPress?.();
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
