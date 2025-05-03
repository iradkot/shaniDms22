# Firebase Setup & Initialization Guide

This document outlines all places you need to configure or verify for React Native Firebase to work correctly and avoid the `No Firebase App '[DEFAULT]' has been created` error.

---

## 1. Native Configuration

### Android
- Place your `google-services.json` in: `android/app/google-services.json`.
- Ensure `android/build.gradle` and `android/app/build.gradle` include the Firebase Gradle plugin:
  ```gradle
  // android/build.gradle
  buildscript {
    dependencies {
      classpath 'com.google.gms:google-services:4.3.15'
    }
  }

  // android/app/build.gradle (at bottom)
  apply plugin: 'com.google.gms.google-services'
  ```

### iOS
- Place your `GoogleService-Info.plist` in: `ios/shaniDms22/GoogleService-Info.plist`.
- In `ios/Podfile`, ensure use_frameworks or static linking as needed, then run `pod install`.

---

## 2. JavaScript Initialization

React Native Firebase reads native config, so **you do NOT** normally need to call `firebase.initializeApp()` manually.

### Common Pitfall
If you import the wrong namespace, e.g.:  
```js
import { firebase } from '@react-native-firebase/messaging';
```
you will see:
```
Error: No Firebase App '[DEFAULT]' has been created
```

### Correct Imports
Use the App module for initialization and access:
```js
import { firebase } from '@react-native-firebase/app';
// then access services:
import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';
```

If you must manually initialize (multi-app scenarios), add at the top of your entry file (`index.js` or `App.tsx`):
```js
import { firebase } from '@react-native-firebase/app';

if (firebase.apps.length === 0) {
  firebase.initializeApp();
}
```

---

## 3. Verify Runtime Setup

- **Android & iOS:** Rebuild the native projects after adding config files:
  ```bash
  cd android && ./gradlew clean assembleDebug
  cd ../ios && pod install && xcodebuild
  ```

- **JS Metro Cache:** Clear cache to avoid stale bundles:
  ```bash
  yarn start --reset-cache
  ```

- **React Native Doctor:** Run `npx react-native doctor` to check environment.

---

## 4. Additional Resources
- React Native Firebase docs: https://rnfirebase.io/
- Android setup: https://rnfirebase.io/#installation-android
- iOS setup: https://rnfirebase.io/#installation-ios

---

If you encounter further issues, add any missing initialization code snippets above or ensure native config files are correctly placed.
