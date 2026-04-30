/**
 * OnboardingScreen snapshot + interaction tests.
 *
 * Mocks:
 *  - useServerConfig   → pre-wired by jest.config.js moduleNameMapper
 *  - ConnectionContext → pre-wired by jest.config.js moduleNameMapper
 *  - expo-router       → inline jest.mock
 *  - useAccount        → inline jest.mock
 *  - ServerProfileSyncContext → inline jest.mock
 *  - device-identity   → inline jest.mock
 *  - react-i18next     → inline jest.mock (returns key as translation)
 */

import React from 'react';
import { renderWithProviders } from '@/__tests__/renderWithProviders';
import { OnboardingScreen } from '../OnboardingScreen';

// ── expo-router ────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

// ── react-i18next ──────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// ── device-identity ────────────────────────────────────────────────────────
jest.mock('@/lib/device-identity', () => ({
  getOrCreateDeviceIdentity: jest.fn().mockResolvedValue({ id: 'device-abc' }),
  formatDeviceFingerprint: (id: string) => id.slice(0, 8),
}));

// ── expo-apple-authentication (used by SignInSheet) ────────────────────────
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0 },
}));

// ── expo-web-browser (used by auth.ts) ─────────────────────────────────────
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

// ── Supabase client (used by auth.ts + SignInSheet) ────────────────────────
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(),
      signInWithIdToken: jest.fn(),
      signInWithOAuth: jest.fn(),
    },
  },
}));

// ── AccountContext ─────────────────────────────────────────────────────────
const mockAccountContext = {
  status: 'signed-out' as 'signed-out' | 'signed-in' | 'unknown',
  user: null,
  session: null,
  account: null,
  entitlement: null,
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  signInWithEmail: jest.fn(),
  signOut: jest.fn(),
  deleteAccount: jest.fn(),
};

jest.mock('@/hooks/useAccount', () => ({
  useAccount: () => mockAccountContext,
}));

// ── ServerProfileSyncContext ───────────────────────────────────────────────
const mockSyncContext = {
  remotePointers: [] as { id: string; url: string; label: string }[],
  isFetchingPointers: false,
};

jest.mock('@/contexts/ServerProfileSyncContext', () => ({
  useServerProfileSync: () => mockSyncContext,
}));

// ── gatewayUrl utils ───────────────────────────────────────────────────────
jest.mock('@/utils/gatewayUrl', () => ({
  parseGatewayWsUrl: () => ({ host: null, isInsecure: false }),
  truncateMiddle: (s: string) => s,
}));

// ── AddServerSheet ─────────────────────────────────────────────────────────
jest.mock('@/components/settings/AddServerSheet', () => ({
  AddServerSheet: jest.fn().mockReturnValue(null),
}));

// ── SignInSheet ────────────────────────────────────────────────────────────
jest.mock('@/components/settings/SignInSheet', () => ({
  SignInSheet: jest.fn().mockReturnValue(null),
}));

// ──────────────────────────────────────────────────────────────────────────

describe('OnboardingScreen', () => {
  beforeEach(() => {
    mockAccountContext.status = 'signed-out';
    mockSyncContext.remotePointers = [];
    mockSyncContext.isFetchingPointers = false;
  });

  it('renders the welcome step with sign-in link when signed out (snapshot)', () => {
    const { toJSON } = renderWithProviders(<OnboardingScreen />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('does not show the sign-in link when already signed in', () => {
    mockAccountContext.status = 'signed-in';
    const { queryByText } = renderWithProviders(<OnboardingScreen />);
    // The sign-in link text key should not be visible
    expect(queryByText('onboarding.welcome.signInLink')).toBeNull();
  });

  it('shows the restore list when signed in with remote pointers (snapshot)', () => {
    mockAccountContext.status = 'signed-in';
    mockSyncContext.remotePointers = [
      { id: 'ptr-1', url: 'wss://alpha.example.com', label: 'Alpha Gateway' },
      { id: 'ptr-2', url: 'wss://beta.example.com', label: 'Beta Gateway' },
    ];
    const { toJSON } = renderWithProviders(<OnboardingScreen />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows a spinner in the restore area while fetching pointers', () => {
    mockAccountContext.status = 'signed-in';
    mockSyncContext.remotePointers = [];
    mockSyncContext.isFetchingPointers = true;
    const { toJSON } = renderWithProviders(<OnboardingScreen />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows empty state when signed in but no remote pointers', () => {
    mockAccountContext.status = 'signed-in';
    mockSyncContext.remotePointers = [];
    mockSyncContext.isFetchingPointers = false;
    const { queryByText } = renderWithProviders(<OnboardingScreen />);
    // When signed in but no remote pointers, falls back to welcome buttons
    expect(queryByText('onboarding.welcome.getStarted')).toBeTruthy();
  });
});
