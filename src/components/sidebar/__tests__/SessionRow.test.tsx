import React from 'react';
import { render } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionRow } from '../SessionRow';
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
    <GestureHandlerRootView>
      <SessionRow
        session={session}
        isActive={isActive}
        isOpen={false}
        colors={colors}
        onSelect={noop}
        onPin={noop}
        onDelete={noop}
        onRename={noop}
      />
    </GestureHandlerRootView>,
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
