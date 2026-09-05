import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from '@react-native-firebase/firestore';
import {getMessaging, getToken} from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_SYNC_KEY = 'lastTokenSyncCheck';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if we need to sync token with server (once per day)
 * and update if the current token isn't in the server's phoneTokens array
 */
export async function syncTokenIfNeeded(): Promise<void> {
  try {
    const lastSyncStr = await AsyncStorage.getItem(TOKEN_SYNC_KEY);
    const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
    const now = Date.now();

    // Only sync once per day
    if (now - lastSync < SYNC_INTERVAL_MS) {
      console.log(
        'rebaseService.syncTokenIfNeeded: sync not needed yet, last sync was',
        new Date(lastSync).toISOString(),
      );
      return;
    }

    console.log(
      'rebaseService.syncTokenIfNeeded: starting daily token sync check',
    );
    const app = getApp();
    const user = getAuth(app).currentUser;
    if (!user) {
      console.warn('rebaseService.syncTokenIfNeeded: no authenticated user');
      return;
    }

    const currentToken = await getToken(getMessaging(app));
    console.log('rebaseService.syncTokenIfNeeded: checking current token');

    // Get current phoneTokens from server
    const database = getFirestore(app);
    const userRef = doc(database, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();
    const serverTokens: string[] = userData?.phoneTokens || [];

    console.log(
      `rebaseService.syncTokenIfNeeded: server has ${serverTokens.length} tokens`,
    );

    // Check if current token exists in server array
    const tokenExists = serverTokens.includes(currentToken);

    if (!tokenExists) {
      console.log(
        'rebaseService.syncTokenIfNeeded: token not found on server, updating...',
      );
      await updateDoc(userRef, {
        phoneTokens: arrayUnion(currentToken),
        updatedAt: serverTimestamp(),
      });
      console.log('rebaseService.syncTokenIfNeeded: token added to server');

      // Read back to verify
      const updatedDoc = await getDoc(userRef);
      const updatedTokenCount = updatedDoc.data()?.phoneTokens?.length ?? 0;
      console.log(
        `rebaseService.syncTokenIfNeeded: server token count is ${updatedTokenCount}`,
      );
    } else {
      console.log(
        'rebaseService.syncTokenIfNeeded: token already exists on server',
      );
    }

    // Update last sync timestamp
    await AsyncStorage.setItem(TOKEN_SYNC_KEY, now.toString());
    console.log(
      'rebaseService.syncTokenIfNeeded: sync completed at',
      new Date(now).toISOString(),
    );
  } catch {
    console.error('rebaseService.syncTokenIfNeeded: failed');
  }
}

/**
 * Register the current device's FCM token in Firestore under user.phoneTokens
 */
export async function registerDeviceToken(): Promise<void> {
  const app = getApp();
  const user = getAuth(app).currentUser;
  if (!user) {
    console.warn('rebaseService.registerDeviceToken: no authenticated user');
    return;
  }

  try {
    const token = await getToken(getMessaging(app));
    console.log('rebaseService.registerDeviceToken: FCM token fetched');
    const userRef = doc(getFirestore(app), 'users', user.uid);
    // Append this device token
    await updateDoc(userRef, {
      phoneTokens: arrayUnion(token),
      updatedAt: serverTimestamp(),
    });
    console.log('rebaseService.registerDeviceToken: token added');
    // Read back to verify
    const snap = await getDoc(userRef);
    const tokenCount = snap.data()?.phoneTokens?.length ?? 0;
    console.log(
      `rebaseService.registerDeviceToken: server token count is ${tokenCount}`,
    );
  } catch {
    console.warn('registerDeviceToken failed');
  }
}

/**
 * Unregister the current device's FCM token from Firestore
 */
export async function unregisterDeviceToken(): Promise<void> {
  const app = getApp();
  const user = getAuth(app).currentUser;
  if (!user) {
    console.warn('rebaseService.unregisterDeviceToken: no authenticated user');
    return;
  }

  try {
    const token = await getToken(getMessaging(app));
    console.log('rebaseService.unregisterDeviceToken: FCM token fetched');
    const userRef = doc(getFirestore(app), 'users', user.uid);
    // Remove this device token
    await updateDoc(userRef, {
      phoneTokens: arrayRemove(token),
      updatedAt: serverTimestamp(),
    });
    console.log('rebaseService.unregisterDeviceToken: token removed');
    // Read back to verify
    const snap = await getDoc(userRef);
    const tokenCount = snap.data()?.phoneTokens?.length ?? 0;
    console.log(
      `rebaseService.unregisterDeviceToken: server token count is ${tokenCount}`,
    );
  } catch {
    console.warn('unregisterDeviceToken failed');
  }
}
