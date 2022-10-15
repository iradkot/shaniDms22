import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';

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

  isSignedIn: boolean;

  getIsSignedIn: () => Promise<boolean> = async () => {
    const isSignedIn = await GoogleSignin.isSignedIn();
    this.isSignedIn = isSignedIn;
    return isSignedIn;
  };
  signIn = async (): Promise<GoogleSignInResult> => {
    try {
      await GoogleSignin.hasPlayServices();
      console.log('hasPlayServices');
      const response = await GoogleSignin.signIn();
      console.log('signIn', response);
      const {idToken} = response;
      console.log('idToken', idToken);
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      console.log('googleCredential', googleCredential);
      // setup web client id
      const user = await auth().signInWithCredential(googleCredential);
      console.log('user', user);
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
