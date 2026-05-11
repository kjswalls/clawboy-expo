jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'raw-nonce-123'),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(async () => 'hashed-nonce-abc'),
}));

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: {
    FULL_NAME: 'FULL_NAME',
    EMAIL: 'EMAIL',
  },
  signInAsync: jest.fn(async () => ({
    identityToken: 'apple-id-token',
  })),
}));

const mockSignInWithIdToken = jest.fn();

jest.mock('../client', () => ({
  supabase: {
    auth: {
      signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args),
    },
  },
}));

describe('signInWithApple', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignInWithIdToken.mockResolvedValue({ error: null });
  });

  it('hashes nonce for Apple and sends raw nonce to Supabase', async () => {
    const { signInWithApple } = require('../auth') as { signInWithApple: () => Promise<void> }; // eslint-disable-line @typescript-eslint/no-require-imports
    const AppleAuthentication = jest.requireMock('expo-apple-authentication') as {
      signInAsync: jest.Mock;
    };
    const Crypto = jest.requireMock('expo-crypto') as {
      digestStringAsync: jest.Mock;
      CryptoDigestAlgorithm: { SHA256: string };
    };

    await signInWithApple();

    expect(Crypto.digestStringAsync).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      'raw-nonce-123'
    );
    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'hashed-nonce-abc' })
    );
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-id-token',
      nonce: 'raw-nonce-123',
    });
  });
});
