// UserService.ts
import {getApp} from '@react-native-firebase/app';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from '@react-native-firebase/firestore';
import {getMessaging, getToken} from '@react-native-firebase/messaging';
import {getAuth} from '@react-native-firebase/auth';
import {FSUser} from 'app/types/user.types';

const sameStrings = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const readMessagingToken = async (app: ReturnType<typeof getApp>) => {
  try {
    const value = await getToken(getMessaging(app));
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  } catch {
    // Sign-in and local app use must not depend on notification permission.
    return undefined;
  }
};

export class UserService {
  /**
   * Fetches the current user's data from Firestore. If the user does not exist,
   * it creates a new record with the provided phone token and email.
   * @returns {Promise<FSUser | null>} The user data if available, otherwise null.
   */
  async getCurrentUserFSData(): Promise<FSUser | null> {
    try {
      const firebaseUser = getAuth(getApp()).currentUser;
      if (!firebaseUser) {
        return null;
      }

      const userId = firebaseUser.uid;
      const app = getApp();
      const database = getFirestore(app);
      const userRef = doc(database, 'users', userId);
      const userDoc = await getDoc(userRef);

      const phoneToken = await readMessagingToken(app);
      const email = firebaseUser.email ?? ''; // Assuming you'd want to use an empty string if email is null or undefined

      if (userDoc.exists()) {
        const raw = userDoc.data() as Partial<FSUser> & {
          readonly phoneToken?: unknown;
        };
        const existingTokens = Array.isArray(raw.phoneTokens)
          ? raw.phoneTokens.filter(
              (value): value is string =>
                typeof value === 'string' && value.length > 0,
            )
          : typeof raw.phoneToken === 'string' && raw.phoneToken.length > 0
            ? [raw.phoneToken]
            : [];
        const phoneTokens = Array.from(
          new Set([
            ...existingTokens,
            ...(phoneToken === undefined ? [] : [phoneToken]),
          ]),
        ).slice(-10);
        const normalized = {
          schemaVersion: 1 as const,
          ownerProductUserId: userId,
          userId,
          email,
          phoneTokens,
          createdAt: raw.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const alreadyNormalized =
          raw.schemaVersion === 1 &&
          raw.ownerProductUserId === userId &&
          raw.userId === userId &&
          raw.email === email &&
          raw.createdAt !== undefined &&
          raw.updatedAt !== undefined &&
          sameStrings(existingTokens, phoneTokens);
        if (alreadyNormalized) {
          return raw as FSUser;
        }
        await setDoc(userRef, normalized);
        return normalized as unknown as FSUser;
      } else {
        // User does not exist, so we attempt to create a new user record.
        await this.createUserFSData(userId, phoneToken, email);

        // Fetch the newly created user data.
        const newUserDoc = await getDoc(userRef);
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
      const userRef = doc(getFirestore(getApp()), 'users', userId);
      const snapshot = await getDoc(userRef);
      const current = snapshot.data() as Partial<FSUser> | undefined;
      const phoneTokens = Array.from(
        new Set([...(current?.phoneTokens ?? []), phoneToken]),
      ).slice(-10);
      await setDoc(userRef, {
        schemaVersion: 1,
        ownerProductUserId: userId,
        userId,
        email: current?.email ?? '',
        phoneTokens,
        createdAt: current?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
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
  async createUserFSData(
    userId: string,
    phoneToken: string | undefined,
    email: string,
  ) {
    try {
      const userRef = doc(getFirestore(getApp()), 'users', userId);
      await setDoc(userRef, {
        schemaVersion: 1,
        ownerProductUserId: userId,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        phoneTokens: phoneToken === undefined ? [] : [phoneToken],
        email,
      });
    } catch (error) {
      console.error('Failed to create user data in Firestore:', error);
      // Handle the error as per your application's requirements
    }
  }
}
