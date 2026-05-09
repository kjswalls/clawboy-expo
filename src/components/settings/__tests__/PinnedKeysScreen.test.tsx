import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { PinnedKeysScreen } from '../PinnedKeysScreen';
import type { ServerProfile } from '@/types';

const FIRST_SEEN_HASH = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabb';
const PINNED_HASH = '1122334455667788990011223344556677889900112233445566778899001122aa11';

const BASE_PROFILE: ServerProfile = {
  id: 'profile-1',
  name: 'Test Gateway',
  url: 'wss://gateway.example.com',
  isActive: true,
};

const mockBack = jest.fn();
const mockUpdateProfileSecurity = jest.fn().mockResolvedValue(undefined);

// Mutable so individual tests can swap out profiles.
let mockProfiles: ServerProfile[] = [BASE_PROFILE];

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/hooks/useServerConfig', () => ({
  useServerConfig: () => ({
    isHydrated: true,
    serverProfiles: mockProfiles,
    activeProfile: null,
    addProfile: async () => ({ id: 'mock', url: '' }),
    removeProfile: async () => {},
    setActiveProfile: async () => {},
    updateProfile: async () => {},
    updateProfileSecurity: mockUpdateProfileSecurity,
    getAuthTokenForProfile: async () => null,
    markConnected: async () => {},
  }),
  ServerConfigProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('PinnedKeysScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfiles = [BASE_PROFILE];
  });

  it('renders with no security data (snapshot)', () => {
    const { toJSON } = renderWithProviders(
      <PinnedKeysScreen profileId="profile-1" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with firstSeenSpkiSha256 TOFU record (snapshot)', () => {
    mockProfiles = [
      {
        ...BASE_PROFILE,
        security: {
          firstSeenSpkiSha256: FIRST_SEEN_HASH,
          firstSeenAt: 1_745_000_000_000,
        },
      },
    ];
    const { toJSON } = renderWithProviders(
      <PinnedKeysScreen profileId="profile-1" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with active pins (snapshot)', () => {
    mockProfiles = [
      {
        ...BASE_PROFILE,
        security: {
          firstSeenSpkiSha256: FIRST_SEEN_HASH,
          firstSeenAt: 1_745_000_000_000,
          pinnedSpkiSha256: [PINNED_HASH],
        },
      },
    ];
    const { toJSON } = renderWithProviders(
      <PinnedKeysScreen profileId="profile-1" />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows a confirmation sheet when Pin button is pressed', () => {
    mockProfiles = [
      {
        ...BASE_PROFILE,
        security: {
          firstSeenSpkiSha256: FIRST_SEEN_HASH,
          firstSeenAt: 1_745_000_000_000,
          pinnedSpkiSha256: [],
        },
      },
    ];
    const { getByLabelText, queryByText } = renderWithProviders(
      <PinnedKeysScreen profileId="profile-1" />,
    );
    expect(queryByText('Pin this certificate?')).toBeNull();
    fireEvent.press(getByLabelText('Pin this key'));
    expect(queryByText('Pin this certificate?')).not.toBeNull();
    expect(mockUpdateProfileSecurity).not.toHaveBeenCalled();
  });

  it('calls updateProfileSecurity with the TOFU hash when Pin confirmation is accepted', () => {
    mockProfiles = [
      {
        ...BASE_PROFILE,
        security: {
          firstSeenSpkiSha256: FIRST_SEEN_HASH,
          firstSeenAt: 1_745_000_000_000,
          pinnedSpkiSha256: [],
        },
      },
    ];
    const { getByLabelText } = renderWithProviders(
      <PinnedKeysScreen profileId="profile-1" />,
    );
    fireEvent.press(getByLabelText('Pin this key'));
    fireEvent.press(getByLabelText('Confirm pin this certificate'));
    expect(mockUpdateProfileSecurity).toHaveBeenCalledWith('profile-1', { pinnedSpkiSha256: [FIRST_SEEN_HASH] });
  });

  it('calls router.back when back button is pressed', () => {
    const { getByLabelText } = renderWithProviders(
      <PinnedKeysScreen profileId="profile-1" />,
    );
    fireEvent.press(getByLabelText('Close pinned keys screen'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
