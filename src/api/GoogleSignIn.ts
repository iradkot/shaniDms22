import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth, {FirebaseAuthTypes, GoogleAuthProvider} from '@react-native-firebase/auth';

/** types */
export type GoogleSignInResult = {
  user: FirebaseAuthTypes.UserCredential | null;
  error: Error | null;
};

class GoogleSignIn {
  constructor() {
    GoogleSignin.configure({
      webClientId:
        '77401553924-f22oqdv7gosp4infh5nflrdo7dmn5rho.apps.googleusercontent.com',
    });

    this.isSignedIn = false;
  }

  /** track sign-in state if needed */
  isSignedIn: boolean;

  /**
   * Attempts silent sign-in to determine if a user is already signed in.
   */
  getIsSignedIn: () => Promise<boolean> = async () => {
    try {
      // silent sign-in will throw if not signed in
      await GoogleSignin.signInSilently();
      this.isSignedIn = true;
      return true;
    } catch {
      this.isSignedIn = false;
      return false;
    }
  };
  signIn = async (): Promise<GoogleSignInResult> => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // trigger Google sign-in UI
      await GoogleSignin.signIn();
      // retrieve tokens (idToken is required for Firebase auth)
      const { idToken, accessToken } = await GoogleSignin.getTokens();
      if (!idToken) {
        return { user: null, error: new Error('Missing idToken from Google sign-in') };
      }
      // create Firebase credential
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const user = await auth().signInWithCredential(credential);
      this.isSignedIn = true;
      return { user, error: null };
    } catch (err: any) {
      console.error('GoogleSignIn.signIn exception:', err);
      // wrap and propagate error
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { user: null, error: new Error(errorMsg) };
    }
  };
  getTokens: () => any = async () => {
    try {
      await GoogleSignin.getTokens();
    } catch (e) {
      console.log('error getting token', e);
    }
  };
}

export default GoogleSignIn;
