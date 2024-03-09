// UserService.ts
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';
import {FSUser} from 'app/types/user.types';

export class UserService {
  /**
   * Fetches the current user's data from Firestore. If the user does not exist,
   * it creates a new record with the provided phone token and email.
   * @returns {Promise<FSUser | null>} The user data if available, otherwise null.
   */
  async getCurrentUserFSData(): Promise<FSUser | null> {
    try {
      const firebaseUser = auth().currentUser;
      if (!firebaseUser) return null;

      const userId = firebaseUser.uid;
      const userDoc = await firestore().collection('users').doc(userId).get();

      if (userDoc.exists) {
        return userDoc.data() as FSUser;
      } else {
        // UserTypes does not exist, so we attempt to create a new user record.
        const phoneToken = await messaging().getToken();
        const email = firebaseUser.email ?? ''; // Assuming you'd want to use an empty string if email is null or undefined
        await this.createUserFSData(userId, phoneToken, email);

        // Fetch the newly created user data.
        const newUserDoc = await firestore()
          .collection('users')
          .doc(userId)
          .get();
        return newUserDoc.data() as FSUser;
      }
    } catch (error) {
      console.error("Failed to get or create user's Firestore data:", error);
      return null; // or throw the error, depending on your error handling strategy
    }
  }

  /**
   * Creates a new user record in Firestore with the given userId, phoneToken, and email.
   * @param {string} userId - The user's ID.
   * @param {string} phoneToken - The phone's messaging token.
   * @param {string} [email] - The user's email address.
   */
  async createUserFSData(userId: string, phoneToken: string, email: string) {
    try {
      await firestore().collection('users').doc(userId).set({
        userId,
        createdAt: firestore.FieldValue.serverTimestamp(),
        phoneToken,
        email,
      });
    } catch (error) {
      console.error('Failed to create user data in Firestore:', error);
      // Handle the error as per your application's requirements
    }
  }
}
