const mockUserId = 'firebase-user-42';
const mockPhoneToken = 'private-phone-token';
const mockUserRef = {path: `users/${mockUserId}`};
const mockCreatedAt = {seconds: 1};
const mockUpdatedAt = {seconds: 2};
const normalizedUser = {
  schemaVersion: 1 as const,
  ownerProductUserId: mockUserId,
  userId: mockUserId,
  email: 'person@example.com',
  phoneTokens: [mockPhoneToken],
  createdAt: mockCreatedAt,
  updatedAt: mockUpdatedAt,
};
const mockGetDoc = jest.fn(async (_reference?: unknown) => ({
  exists: () => true,
  data: () => normalizedUser,
}));
const mockSetDoc = jest.fn(
  async (_reference?: unknown, _data?: unknown) => undefined,
);
const mockGetToken = jest.fn(async (_messaging?: unknown) => mockPhoneToken);

jest.mock('@react-native-firebase/app', () => ({
  getApp: () => ({name: '[DEFAULT]'}),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({
    currentUser: {uid: mockUserId, email: 'person@example.com'},
  }),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({app: '[DEFAULT]'}),
  getToken: (messaging: unknown) => mockGetToken(messaging),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({app: '[DEFAULT]'}),
  doc: () => mockUserRef,
  getDoc: (reference: unknown) => mockGetDoc(reference),
  setDoc: (reference: unknown, data: unknown) => mockSetDoc(reference, data),
  serverTimestamp: () => ({operation: 'serverTimestamp'}),
}));

import {UserService} from '../src/api/firebase/services/UserService';

describe('UserService modular Firebase access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(mockPhoneToken);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => normalizedUser,
    });
  });

  it('returns an existing v1 user without rewriting an unchanged token', async () => {
    const user = await new UserService().getCurrentUserFSData();

    expect(user).toEqual(normalizedUser);
    expect(mockGetDoc).toHaveBeenCalledWith(mockUserRef);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('creates and reads back a missing user with strict owner fields', async () => {
    mockGetDoc
      .mockResolvedValueOnce({exists: () => false, data: () => undefined})
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => normalizedUser,
      });

    const user = await new UserService().getCurrentUserFSData();

    expect(mockSetDoc).toHaveBeenCalledWith(mockUserRef, {
      schemaVersion: 1,
      ownerProductUserId: mockUserId,
      userId: mockUserId,
      createdAt: {operation: 'serverTimestamp'},
      updatedAt: {operation: 'serverTimestamp'},
      phoneTokens: [mockPhoneToken],
      email: 'person@example.com',
    });
    expect(user).toEqual(normalizedUser);
  });

  it('migrates a legacy phoneToken document once', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        userId: mockUserId,
        email: 'person@example.com',
        phoneToken: mockPhoneToken,
        createdAt: mockCreatedAt,
      }),
    });

    await new UserService().getCurrentUserFSData();

    expect(mockSetDoc).toHaveBeenCalledWith(
      mockUserRef,
      expect.objectContaining({
        schemaVersion: 1,
        ownerProductUserId: mockUserId,
        phoneTokens: [mockPhoneToken],
        createdAt: mockCreatedAt,
      }),
    );
  });

  it('does not make account loading depend on notification permission', async () => {
    mockGetToken.mockRejectedValue(new Error('messaging permission denied'));
    const withoutNotifications = {...normalizedUser, phoneTokens: []};
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => withoutNotifications,
    });

    await expect(new UserService().getCurrentUserFSData()).resolves.toEqual(
      withoutNotifications,
    );
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
