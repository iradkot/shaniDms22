import { getApp } from '@react-native-firebase/app';
import { getAuth, FirebaseAuthTypes } from '@react-native-firebase/auth';

export class AuthService {
  getCurrentUser: () => Promise<FirebaseAuthTypes.User | null> = async () => {
    // Use modular Auth API
    const authInstance = getAuth(getApp());
    return authInstance.currentUser;
  };
}
