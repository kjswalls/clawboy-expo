import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { PinnedKeysScreen } from '../PinnedKeysScreen';
import type { ServerProfile } from '@/types';

const BASE_PROFILE: ServerProfile = {
  id: 'profile-1',
  name: 'Test Gateway',
  url: 'wss://gateway.example.com',
  isActive: true,
};

const FIRST_SEEN_HASH = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabb';
const PINNED_HASH = '1122334455667788990011223344556677889900112233445566778899001122aa11';

describe('PinnedKeysScreen', () => {
  const onUpdatePins = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with no security data (snapshot)', () => {
    const { toJSON } = renderWithProviders(
      <PinnedKeysScreen
        visible
        profile={BASE_PROFILE}
        onClose={onClose}
        onUpdatePins={onUpdatePins}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with firstSeenSpkiSha256 TOFU record (snapshot)', () => {
    const profile: ServerProfile = {
      ...BASE_PROFILE,
      security: {
        firstSeenSpkiSha256: FIRST_SEEN_HASH,
        firstSeenAt: 1_745_000_000_000,
      },
    };
    const { toJSON } = renderWithProviders(
      <PinnedKeysScreen
        visible
        profile={profile}
        onClose={onClose}
        onUpdatePins={onUpdatePins}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with active pins (snapshot)', () => {
    const profile: ServerProfile = {
      ...BASE_PROFILE,
      security: {
        firstSeenSpkiSha256: FIRST_SEEN_HASH,
        firstSeenAt: 1_745_000_000_000,
        pinnedSpkiSha256: [PINNED_HASH],
      },
    };
    const { toJSON } = renderWithProviders(
      <PinnedKeysScreen
        visible
        profile={profile}
        onClose={onClose}
        onUpdatePins={onUpdatePins}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows a confirmation sheet when Pin button is pressed', () => {
    const profile: ServerProfile = {
      ...BASE_PROFILE,
      security: {
        firstSeenSpkiSha256: FIRST_SEEN_HASH,
        firstSeenAt: 1_745_000_000_000,
        pinnedSpkiSha256: [],
      },
    };
    const { getByLabelText, queryByText } = renderWithProviders(
      <PinnedKeysScreen
        visible
        profile={profile}
        onClose={onClose}
        onUpdatePins={onUpdatePins}
      />,
    );
    expect(queryByText('Pin this certificate?')).toBeNull();
    fireEvent.press(getByLabelText('Pin this key'));
    expect(queryByText('Pin this certificate?')).not.toBeNull();
    expect(onUpdatePins).not.toHaveBeenCalled();
  });

  it('calls onUpdatePins with the TOFU hash when Pin confirmation is accepted', () => {
    const profile: ServerProfile = {
      ...BASE_PROFILE,
      security: {
        firstSeenSpkiSha256: FIRST_SEEN_HASH,
        firstSeenAt: 1_745_000_000_000,
        pinnedSpkiSha256: [],
      },
    };
    const { getByLabelText } = renderWithProviders(
      <PinnedKeysScreen
        visible
        profile={profile}
        onClose={onClose}
        onUpdatePins={onUpdatePins}
      />,
    );
    fireEvent.press(getByLabelText('Pin this key'));
    fireEvent.press(getByLabelText('Confirm pin this certificate'));
    expect(onUpdatePins).toHaveBeenCalledWith('profile-1', [FIRST_SEEN_HASH]);
  });

  it('calls onClose when back button is pressed', () => {
    const { getByLabelText } = renderWithProviders(
      <PinnedKeysScreen
        visible
        profile={BASE_PROFILE}
        onClose={onClose}
        onUpdatePins={onUpdatePins}
      />,
    );
    fireEvent.press(getByLabelText('Close pinned keys screen'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
