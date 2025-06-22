# React Native Firebase Migration & Debug Checklist

This guide collects all recommended fixes, checks, and next‑steps for migrating from the legacy namespaced API to the modular API, handling Hermes micro‑task issues, and verifying your Firebase setup.

---

## 1. Deprecation‐warnings: Switch to the modular API

React‑Native‑Firebase (v14–v21) still exposes the old “namespaced” syntax, but v22+ (RN 0.71+) uses the **modular** SDK. Every call like:

```ts
import { firebase } from '@react-native-firebase/app';

// legacy namespaced:
const user = firebase.auth().currentUser;
const items = await firebase.firestore().collection('foo').get();
```

will print:

```
This method is deprecated … Please use getApp() instead.
```

### Quick fix (modular imports):

```ts
// Core app module
import '@react-native-firebase/app';

// Import service clients directly
import { getApp } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';

// Initialize
const app   = getApp();               // [DEFAULT]
const store = getFirestore(app);      // modular Firestore client
const user  = auth().currentUser;     // modular Auth call
```

> Warning disappears and everything else keeps working.

### Long‑term: Full v22 migration

1. **Search & replace** every `firebase.<service>()` with the modular imports above.
2. Enable the **strict modular flag** during development to catch any legacy calls:

```ts
import '@react-native-firebase/app';
// any other RN‑Firebase import…

// Throw whenever a namespaced API is used:
global.__rnfirebase_use_modular__ = true;
```

See the official migration guide: https://rnfirebase.io/migrating-to-v22

❶  **Strict modular flag**  
Before any RN‑Firebase import, add:
```ts
// throws at dev‑time if legacy namespaced API is used
global.__rnfirebase_use_modular__ = true;
```
This ensures any leftover `firebase.<service>()` patterns cause immediate errors in development.

---

## 2. Hermes “Could not enqueue microtask … disabled in this runtime”

### What’s happening?
Hermes disables micro‑tasks (Promises, `queueMicrotask`) inside a JSI HostFunction (native thread). Calling an async/await or Promise directly in background handlers crashes:

```ts
// ❌ Crash on Hermes
messaging().setBackgroundMessageHandler(async remoteMessage => {
  await processMessage(remoteMessage);
});
```

### Minimal crash‑proof pattern

```ts
messaging().setBackgroundMessageHandler(remoteMessage => {
  // defer to JS thread, avoiding microtask in native callback
  setImmediate(() => {
    processMessage(remoteMessage)
      .catch(console.error);
  });
});
```

> Other RN modules (Notifee, Reanimated, Realm) may trigger similar errors.  
> **Temporary safeguards:**
> - Upgrade Hermes to 0.15.1+ (`gradle.properties`: `hermesEnabled=true`)  
> - If still failing, use the `setImmediate` shim above.

### ❷ Confirm Hermes engine version
In `android/gradle.properties`, ensure you have:
```properties
hermesEnabled=true        # enable Hermes
expo.jsEngine=hermes      # if using Expo
# Hermes v0.15.1+ includes the microtask fix
```
This guarantees your release uses the patched Hermes engine.

### ❷ Confirm Hermes engine version
In `android/gradle.properties`, ensure you have:
```properties
hermesEnabled=true        # enable Hermes
expo.jsEngine=hermes      # if using Expo
# Hermes v0.15.1+ includes the microtask fix
```
This guarantees your release uses the patched Hermes engine.

---

## 3. Additions for your Firebase Setup & Initialization Guide

Ensure your entry points initialize the modular SDK first and guard against legacy calls:

```diff
@@ JavaScript Initialization
-import { firebase } from '@react-native-firebase/messaging';
-// …
-if (firebase.apps.length === 0) {
-  firebase.initializeApp();
-}
+// Core app module (register [DEFAULT])
+import '@react-native-firebase/app';
+
+// Modular imports
+import { getApp } from '@react-native-firebase/app';
+import auth from '@react-native-firebase/auth';
+import { getFirestore } from '@react-native-firebase/firestore';
+
+// Initialize and verify defaults
+const app   = getApp();            // returns [DEFAULT]
+const store = getFirestore(app);   // Firestore client
+
+// Strict modular check (throws on old API usage)
+global.__rnfirebase_use_modular__ = true;
```

### Verify runtime and diagnose warnings
```bash
# React Native health check (RN‑CLI > 11.0)
npx react-native doctor

# Stream relevant logs
adb logcat -s ReactNativeFirebase:V ReactNative:V AndroidRuntime:E *:S
```

Add a **Hermes caveats** subsection in your docs to warn about the micro‑task restriction.

---

## 4. Next checkpoints & verification

- **Search** the codebase for any remaining `firebase.<service>()` calls and convert them to modular imports.
- **Review** all background handlers (messaging, TurboModules) and wrap async work in `setImmediate` as shown.
- **Re-run** the app with `adb logcat` streaming—verify that:
  - No deprecation warnings appear.
  - No micro‑task crash stack traces occur.
❸ **Align RN‑Firebase versions**  
Pin all `@react-native-firebase/*` dependencies in `package.json` to the *same* patch level (e.g. 21.6.x or 22.1.x):  
```json
  "@react-native-firebase/app": "^21.6.0",
  "@react-native-firebase/auth": "^21.6.0",
  "@react-native-firebase/firestore": "^21.6.0",
  "@react-native-firebase/messaging": "^21.6.0",
  "@react-native-firebase/storage": "^21.6.0",
```  
Mixed patch levels can re‑introduce deprecated shims.
- Once versions are aligned and logs are clean, **bump** all `@react-native-firebase/*` to the final dual‑API patch (e.g. v21.6.3).  
  Migration to v22 then becomes a single dependency update.

> Happy coding—once these two issues are locked down, your runtime logs should be clear and ready for production!
