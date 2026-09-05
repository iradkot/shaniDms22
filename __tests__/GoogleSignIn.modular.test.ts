const mockAuth = {name: '[DEFAULT]'};
const mockCredential = {providerId: 'google.com'};
const mockUserCredential = {user: {uid: 'firebase-user-42'}};
const mockGetTokens = jest.fn(async () => ({
  idToken: 'google-id-token',
  accessToken: 'google-access-token',
}));
const mockCredentialFactory = jest.fn(
  (_idToken?: string, _accessToken?: string | null) => mockCredential,
);
const mockSignInWithCredential = jest.fn(
  async (_auth?: unknown, _credential?: unknown) => mockUserCredential,
);

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signInSilently: jest.fn(async () => ({user: {}})),
    signIn: jest.fn(async () => ({user: {}})),
    getTokens: () => mockGetTokens(),
  },
}));

jest.mock('@react-native-firebase/app', () => ({
  getApp: () => ({name: '[DEFAULT]'}),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => mockAuth,
  GoogleAuthProvider: {
    credential: (idToken: string, accessToken: string | null) =>
      mockCredentialFactory(idToken, accessToken),
  },
  signInWithCredential: (auth: unknown, credential: unknown) =>
    mockSignInWithCredential(auth, credential),
}));

import GoogleSignIn from '../src/api/GoogleSignIn';

describe('GoogleSignIn modular Firebase auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTokens.mockResolvedValue({
      idToken: 'google-id-token',
      accessToken: 'google-access-token',
    });
  });

  it('exchanges the Google credential through the modular auth function', async () => {
    const result = await new GoogleSignIn().signIn();

    expect(mockCredentialFactory).toHaveBeenCalledWith(
      'google-id-token',
      'google-access-token',
    );
    expect(mockSignInWithCredential).toHaveBeenCalledWith(
      mockAuth,
      mockCredential,
    );
    expect(result).toEqual({user: mockUserCredential, error: null});
  });

  it('does not call Firebase auth when Google omits its ID token', async () => {
    mockGetTokens.mockResolvedValueOnce({
      idToken: null as unknown as string,
      accessToken: 'google-access-token',
    });

    const result = await new GoogleSignIn().signIn();

    expect(mockSignInWithCredential).not.toHaveBeenCalled();
    expect(result.user).toBeNull();
    expect(result.error?.message).toBe('Missing idToken from Google sign-in');
  });
});
