import { firebaseApp } from 'app/firebase';
import { getAuth, User } from 'firebase/auth';

export class AuthService {
  getCurrentUser: () => Promise<User | null> = async () => {
    const authInstance = getAuth(firebaseApp);
    return authInstance.currentUser;
  };
}
