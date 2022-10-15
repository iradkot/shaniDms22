import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';

GoogleSignin.configure();

/** types */
type GoogleSignInResult = {
  user: FirebaseAuthTypes.UserCredential | null;
  error: Error | null;
};

class GoogleSignIn {
  constructor() {
    GoogleSignin.configure();
    this.isSignedIn = false;
  }

  isSignedIn: boolean;

  signIn = async (): Promise<GoogleSignInResult> => {
    try {
      await GoogleSignin.hasPlayServices();
      const {idToken} = await GoogleSignin.signIn();
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      const user = await auth().signInWithCredential(googleCredential);
      this.isSignedIn = true;
      return {user, error: null};
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return {user: null, error: new Error('User Cancelled the Login Flow')};
      } else if (error.code === statusCodes.IN_PROGRESS) {
        return {user: null, error: new Error('Signing In')};
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return {
          user: null,
          error: new Error('Play Services Not Available or Outdated'),
        };
      } else {
        return {user: null, error};
      }
    }
  };
  getTokens: () => any = async () => {
    try {
      const tokens = await GoogleSignin.getTokens();
      console.log('got tokens:', tokens);
    } catch (e) {
      console.log('error getting token', e);
    }
  };
}

export default GoogleSignIn;
