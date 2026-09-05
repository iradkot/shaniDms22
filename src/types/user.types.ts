export interface UserTypes {
  user: {
    id: string;
    name: string | null;
    email: string;
    photo: string | null;
    familyName: string | null;
    givenName: string | null;
  };
  scopes?: string[];
  idToken: string | null;
  /**
   * Not null only if a valid webClientId and offlineAccess: true was
   * specified in configure().
   */
  serverAuthCode: string | null;
}

export interface FSUser {
  schemaVersion: 1;
  ownerProductUserId: string;
  userId: string;
  email: string;
  phoneTokens: string[];
  createdAt: unknown;
  updatedAt: unknown;
}
