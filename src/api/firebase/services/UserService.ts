// UserService.ts
import { firebaseApp } from 'app/firebase';
import { getFirestore, FieldValue, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken } from 'firebase/messaging';
import {FSUser} from 'app/types/user.types';

export class UserService {
  /**
   * Fetches the current user's data from Firestore. If the user does not exist,
   * it creates a new record with the provided phone token and email.
   * @returns {Promise<FSUser | null>} The user data if available, otherwise null.
   */
  /**
   * Fetches the current user's data from Firestore. If the user does not exist,
   * it creates a new record with the provided phone token and email.
   * @returns {Promise<FSUser | null>} The user data if available, otherwise null.
   */
  async getCurrentUserFSData(): Promise<FSUser | null> {
    try {
      const firebaseUser = getAuth(firebaseApp).currentUser;
      if (!firebaseUser) return null;

      const userId = firebaseUser.uid;
      const userDocRef = doc(getFirestore(firebaseApp), 'users', userId);
      const userDoc = await getDoc(userDocRef);

      const phoneToken = await getToken(getMessaging(firebaseApp));
      const email = firebaseUser.email ?? ''; // Assuming you'd want to use an empty string if email is null or undefined

      if (userDoc.exists) {
        const userData = userDoc.data() as FSUser;

        if (userData.phoneToken !== phoneToken) {
        await this.updateUserPhoneToken(userId, phoneToken);
        }

        return {...userData, phoneToken}; // Return updated user data including new phoneToken
      } else {
        // User does not exist, so we attempt to create a new user record.
        await this.createUserFSData(userId, phoneToken, email);

        const newUserDoc = await getDoc(doc(getFirestore(firebaseApp), 'users', userId));
        return newUserDoc.data() as FSUser;
      }
    } catch (error) {
      console.error("Failed to get or create user's Firestore data:", error);
      return null; // or throw the error, depending on your error handling strategy
    }
  }

  /**
   * Updates the user's phone token in Firestore.
   * @param {string} userId - The user's ID.
   * @param {string} phoneToken - The new phone's messaging token.
   */
  async updateUserPhoneToken(userId: string, phoneToken: string) {
    try {
      await updateDoc(doc(getFirestore(firebaseApp), 'users', userId), {
        phoneToken,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to update user phone token in Firestore:', error);
      // Handle the error as per your application's requirements
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
      await setDoc(doc(getFirestore(firebaseApp), 'users', userId), {
        userId,
        createdAt: FieldValue.serverTimestamp(),
        phoneToken,
        email,
      });
    } catch (error) {
      console.error('Failed to create user data in Firestore:', error);
      // Handle the error as per your application's requirements
    }
  }
}
