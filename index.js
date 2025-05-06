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

// Setup crash-proof background message handler via modular API
const messagingBG = getMessaging(getApp());
messagingBG.setBackgroundMessageHandler(remoteMessage => {
  setImmediate(() => {
    console.log('index.js: background message handler, msgID=', remoteMessage.messageId);
    // TODO: add actual background handling logic here
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
