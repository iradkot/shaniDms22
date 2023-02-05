import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';

export class AuthService {
  getCurrentUser: () => Promise<FirebaseAuthTypes.User | null> = async () => {
    const user = await auth().currentUser;
    return user;
  };
}
