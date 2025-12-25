import * as AuthSession from 'expo-auth-session';
import { getAuth, GoogleAuthProvider, signInWithCredential, UserCredential } from 'firebase/auth';
import { firebaseApp } from 'app/firebase';

/** types */
export type GoogleSignInResult = {
  user: UserCredential | null;
  error: Error | null;
};

class GoogleSignIn {
  constructor() {
    this.isSignedIn = false;
  }

  /** track sign-in state if needed */
  isSignedIn: boolean;

  /**
   * Attempts silent sign-in to determine if a user is already signed in.
   */
  getIsSignedIn: () => Promise<boolean> = async () => {
    return this.isSignedIn;
  };

  signIn = async (): Promise<GoogleSignInResult> => {
    try {
      const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=token` +
        `&scope=profile%20email`;
      const result = await AuthSession.startAsync({ authUrl });
      if (result.type !== 'success' || !result.params.access_token) {
        return { user: null, error: new Error('Google sign-in cancelled') };
      }
      const credential = GoogleAuthProvider.credential(null, result.params.access_token);
      const user = await signInWithCredential(getAuth(firebaseApp), credential);
      this.isSignedIn = true;
      return { user, error: null };
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      return { user: null, error: new Error(msg) };
    }
  };
  getTokens: () => any = async () => {
    return null;
  };
}

export default GoogleSignIn;
