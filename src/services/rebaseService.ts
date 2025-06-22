import messaging from '@react-native-firebase/messaging';
import { getAuth } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
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
      console.log('rebaseService.syncTokenIfNeeded: sync not needed yet, last sync was', new Date(lastSync).toISOString());
      return;
    }

    console.log('rebaseService.syncTokenIfNeeded: starting daily token sync check');
    const user = getAuth().currentUser;
    if (!user) {
      console.warn('rebaseService.syncTokenIfNeeded: no authenticated user');
      return;
    }

    const currentToken = await messaging().getToken();
    console.log(`rebaseService.syncTokenIfNeeded: checking token=${currentToken.substring(0, 20)}...`);

    // Get current phoneTokens from server
    const userDoc = await firestore().collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    const serverTokens: string[] = userData?.phoneTokens || [];
    
    console.log(`rebaseService.syncTokenIfNeeded: server has ${serverTokens.length} tokens`);

    // Check if current token exists in server array
    const tokenExists = serverTokens.includes(currentToken);
    
    if (!tokenExists) {
      console.log('rebaseService.syncTokenIfNeeded: token not found on server, updating...');
      await firestore().collection('users').doc(user.uid).update({
        phoneTokens: firestore.FieldValue.arrayUnion(currentToken),
      });
      console.log('rebaseService.syncTokenIfNeeded: token added to server');
      
      // Read back to verify
      const updatedDoc = await firestore().collection('users').doc(user.uid).get();
      console.log('rebaseService.syncTokenIfNeeded: phoneTokens now =', updatedDoc.data()?.phoneTokens);
    } else {
      console.log('rebaseService.syncTokenIfNeeded: token already exists on server');
    }

    // Update last sync timestamp
    await AsyncStorage.setItem(TOKEN_SYNC_KEY, now.toString());
    console.log('rebaseService.syncTokenIfNeeded: sync completed at', new Date(now).toISOString());

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('rebaseService.syncTokenIfNeeded: failed', err.message);
  }
}

/**
 * Register the current device's FCM token in Firestore under user.phoneTokens
 */
export async function registerDeviceToken(): Promise<void> {
  const user = getAuth().currentUser;
  console.log('rebaseService.registerDeviceToken: currentUser:', user?.uid);
  if (!user) {
    console.warn('rebaseService.registerDeviceToken: no authenticated user');
    return;
  }

  try {
    const token = await messaging().getToken();
    console.log(`rebaseService.registerDeviceToken: fetched FCM token=${token}`);
    const userRef = firestore().collection('users').doc(user.uid);
    // Append this device token
    await userRef.update({
      phoneTokens: firestore.FieldValue.arrayUnion(token),
    });
    console.log(`rebaseService.registerDeviceToken: token added for user=${user.uid}`);
    // Read back to verify
    const snap = await firestore().collection('users').doc(user.uid).get();
    console.log('rebaseService.registerDeviceToken: phoneTokens now =', snap.data()?.phoneTokens);
  } catch (rawErr) {
    // Handle non-Error throwables safely
    const err = rawErr instanceof Error ? rawErr : new Error(JSON.stringify(rawErr));
    console.warn(
      'registerDeviceToken failed:',
      err.message,
      '\nStack:',
      err.stack
    );
  }
}

/**
 * Unregister the current device's FCM token from Firestore
 */
export async function unregisterDeviceToken(): Promise<void> {
  const user = getAuth().currentUser;
  console.log('rebaseService.unregisterDeviceToken: currentUser:', user?.uid);
  if (!user) {
    console.warn('rebaseService.unregisterDeviceToken: no authenticated user');
    return;
  }

  try {
    const token = await messaging().getToken();
    console.log(`rebaseService.unregisterDeviceToken: fetched FCM token=${token}`);
    const userRef = firestore().collection('users').doc(user.uid);
    // Remove this device token
    await userRef.update({
      phoneTokens: firestore.FieldValue.arrayRemove(token),
    });
    console.log(`rebaseService.unregisterDeviceToken: token removed for user=${user.uid}`);
    // Read back to verify
    const snap = await firestore().collection('users').doc(user.uid).get();
    console.log('rebaseService.unregisterDeviceToken: phoneTokens now =', snap.data()?.phoneTokens);
  } catch (rawErr) {
    const err = rawErr instanceof Error ? rawErr : new Error(JSON.stringify(rawErr));
    console.warn(
      'unregisterDeviceToken failed:',
      err.message,
      '\nStack:',
      err.stack
    );
  }
}
