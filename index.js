/**
 * @format
 */

// Enforce RN‑Firebase modular API mode (throws on legacy namespaced calls)
// Enforce RN-Firebase modular API mode (throws on legacy namespaced calls)
// Must set this flag before importing any RN-Firebase modules
global.__rnfirebase_use_modular__ = true;
import '@react-native-firebase/app';
import {AppRegistry} from 'react-native';
import { getApp } from '@react-native-firebase/app';
import { getMessaging } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

// Setup crash-proof background message handler with notification display
const messagingBG = getMessaging(getApp());
messagingBG.setBackgroundMessageHandler(remoteMessage => {
  setImmediate(async () => {
    console.log('index.js: background message handler, msgID=', remoteMessage.messageId);
    try {
      // Ensure Android channel
      const channelId = await notifee.createChannel({
        id: 'default',
        name: 'Default Channel',
        importance: AndroidImportance.HIGH,
      });
      console.log('index.js: notifee channelId=', channelId);
      // Display the notification
      await notifee.displayNotification({
        title: remoteMessage.notification?.title,
        body: remoteMessage.notification?.body,
        android: { channelId },
      });
      console.log('index.js: displayed background notification');
    } catch (err) {
      console.error('index.js: error displaying background notification', err);
    }
  });
});
import App from './src/App';
import {name as appName} from './app.json';

console.log('index.js: registering component', appName);
// Ensure registerComponent runs only once
if (!global.__APP_REGISTERED__) {
  console.log('index.js: registering component', appName);
  AppRegistry.registerComponent(appName, () => App);
  global.__APP_REGISTERED__ = true;
}
