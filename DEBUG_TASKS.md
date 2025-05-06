# React Native White Screen Debugging Tasks

This document provides a step-by-step checklist and codebase-specific instructions to debug and resolve white screen issues in your React Native project (`shaniDms22`).

---

## 0. Quick Triage (5 min)

### 0.1 Rebuild Metro cache
- **Command:**
  ```sh
  yarn start --reset-cache
  ```
- **Expected:** Bundler banner appears in terminal.

### 0.2 Verify the device sees Metro
- **Command:**
  ```sh
  adb reverse tcp:8081 tcp:8081
  ```
- **Expected:** Reload in dev-menu succeeds.

### 0.3 Disable Fast Refresh once
- **Action:** Open the dev menu on your device/emulator and disable Fast Refresh.
- **Why:** Some blank-screen loops are hot-reload bugs.

### 0.4 Add index.js entry sentinel
- **File:** `index.js` (top)
  ```js
  console.log('index.js: entry');
  ```
- **Check:** Must appear in Logcat before any other logs.

### 0.5 Add App.tsx entry sentinel
- **File:** `src/App.tsx` (very top)
  ```ts
  console.log('APP ENTRY REACHED');
  ```
- **Check:** Should appear in Logcat after `index.js: entry`.

### 0.6 Confirm Metro bundle delivery
- **Command:** Watch Metro terminal for `GET /index.bundle?platform=android ... 200 OK`
- **Why:** If missing or non-200, Metro never delivered the JS bundle.
---

## 1. Make React Native Crash Loud Again

### 1.1 Turn off Bridgeless & Fabric temporarily
- **File:** `android/gradle.properties`
  ```properties
  newArchEnabled=false
  ```
- **File:** `ios/Podfile`
  ```ruby
  # RCT_NEW_ARCH_ENABLED = '1'
  RCT_NEW_ARCH_ENABLED = '0'
  ```
- **Action:**
  - Reinstall pods:
    ```sh
    cd android && ./gradlew clean assembleDebug
    cd ios && pod install
    ```

### 1.2 Add a global error hook
- **File:** `index.js` (very top, before any imports)
  ```js
  import 'setimmediate'; // Fills queueMicrotask on Hermes
 global.ErrorUtils.setGlobalHandler((err, isFatal) => {
   console.log('[RN-UNCAUGHT]', err, isFatal);
 });
 
 ### 1.2.1 Add setImmediate shim
 - File: `index.js` (very top, before any other imports)
   ```js
   import 'setimmediate'; // Shim for Hermes microtasks
   ```
 
 ### 1.2.2 Add global crash handler
 - File: `index.js` (immediately after imports)
   ```js
   global.ErrorUtils.setGlobalHandler((error, isFatal) => {
     console.log('[RN-UNCAUGHT]', error, isFatal);
   });
   ```
  ```
- **Result:** Any render-time exception prints to Logcat and Chrome console.
 - **Result:** Any render-time exception prints to Logcat and Chrome console.

### 1.3 Check for Double AppRegistry Registration
- **File:** `index.js`
- **Check:** Ensure `AppRegistry.registerComponent` is called only once (guard with `global.__APP_REGISTERED__`).
- **Why:** Double registration causes reload loops and lost logs.

### 1.4 Check for Async/Await in Host Functions
- **Search:** Look for `async` or `await` inside any function passed to native modules (e.g., background message handler).
- **Why:** Promises in host-functions disable microtasks in Hermes, causing errors like “Could not enqueue microtask”.

### 1.5 Check for Hermes Microtask Errors
- **Symptom:** `Could not enqueue microtask because they are disabled in this runtime`
- **Fix:** Remove `async/await` from host-functions; use `setImmediate` or move async logic outside.

### 1.6 Check for Reload Loops
- **Symptom:** Repeated logs about `getOrCreateReloadTask`, `ReactContext.onHostPause`, or `Destroying ReactContext`.
- **Fix:** Verify no code triggers reloads in a loop (Fast Refresh, custom logic); ensure only one registration.

### 1.7 Check for Component Property Map Warnings
- **Symptom:** Warnings like `Component property map contains multiple entries for 'borderColor'`.
- **Fix:** Look for duplicate style props in custom components or styled-components; remove conflicts.

### 1.8 Check MainApplication and Bridgeless settings
- **File:** `android/app/src/main/java/com/shanidms22/MainApplication.kt`
- **Check:** If `newArchEnabled=false`, ensure DevSupportManager and ReactNativeHost are configured correctly (no Bridgeless reload loops).
- **Why:** Misconfigured ReactHost can tear down ReactContext unexpectedly and prevent logs.

### 1.9 Check background message handlers
- **File:** `index.js`
- **Search:** `setBackgroundMessageHandler`
- **Check:** No `async`/`await` or Promises inside callback; must defer with `setImmediate`.
- **Why:** Hermes disables microtasks in a HostFunction, causing `Could not enqueue microtask` errors.

### 1.8 Check for "Could Not Find Generated Setter" Warnings
- **Symptom:** `Could not find generated setter for class ...` in UIManagerBinding logs.
- **Note:** Often benign, but if a module isn’t working, verify autolinking and native module registration.

### 1.9 Check for Direct Event Name Errors (CameraView)
- **Symptom:** `Direct event name for 'CameraView' doesn't correspond to the naming convention ...`
- **Fix:** Ensure compatible versions of VisionCamera and worklets-core dependency.

### 1.10 Verify MainActivity configuration
- **File:** `android/app/src/main/java/com/shanidms22/MainActivity.java`
- **Check:** It extends `ReactActivity`, `getMainComponentName()` matches `appName`, and does not override lifecycle methods that suppress reload or DevLoadingView.
- **Why:** Misconfigured MainActivity can prevent the redbox or loading indicator from appearing.

### 1.11 Disable HMR & Fast Refresh at runtime
- **Command:** In the Dev Menu, disable Hot Module Replacement and Fast Refresh.
- **Why:** HMR can cause repeated reloads and “bad application bundle” errors in logs.
---

## 2. Confirm JavaScript is Actually Executed

### 2.1 Add a sentinel log at the top of `src/App.tsx`
- **File:** `src/App.tsx`
  ```ts
  console.log('APP ENTRY REACHED');
  ```
- **Check:** If you do not see this in Logcat, Metro never delivered the bundle. Check for `GET ?platform=android ... 200` in the Metro terminal.

### 2.2 Confirm index.js sentinel appears
- **Check:** Look for `index.js: entry` in Logcat. If missing, JS did not run.

### 2.3 Confirm App.tsx sentinel appears
- **Check:** Look for `APP ENTRY REACHED` after `index.js: entry`. If missing, bundle is broken or entry file not executed.

### 2.4 Check for bad application bundle errors
- **Symptom:** `Attempting to call JS function on a bad application bundle` in Logcat.
- **Fix:** Clear Metro cache, rebuild app, disable HMR/Reload loops.
---

## 3. Binary-Search the Component Tree

### 3.1 Render a plain pink View at the root
- **File:** `src/App.tsx`
  ```tsx
  export default function App() {
    return <View style={{flex:1,backgroundColor:'pink'}} />;
  }
  ```
- **Result:** If the screen is pink, the root container is fine. If still white, native view didn’t mount: keep Fabric/Bridgeless off, and check for a native crash in Logcat (AndroidRuntime E lines).

### 3.2 Re-enable providers one-by-one
- **Order:**
  1. Reanimated 3 providers
  2. ThemeProvider (styled-components)
  3. React Navigation
  4. Others
- **How:**
  - Add `console.log('[RENDER]', 'ProviderX')` inside every provider’s body in `src/App.tsx` until the screen goes blank again. The last one you added is the offender.

---

## 4. Common Run-Time Traps That Blank the UI

| Symptom in Logcat | Root Cause | Fix |
|-------------------|------------|-----|
| Could not enqueue microtask because they are disabled in this runtime | Await/Promise used inside a Hermes host-function (e.g. messaging().setBackgroundMessageHandler) | Wrap handler in setImmediate() or remove async |
| Tried to enqueue runnable on already finished thread spam | React context torn down by a reload loop | Delete double AppRegistry.registerComponent calls; guard with a global flag |
| Expected style "shadowRadius: 4" to contain units | Raw shadowRadius in styled-components now requires units with Fabric | Use shadowRadius: 4 only on iOS, or migrate to elevation on Android |

---

## 5. Verify Firebase Modular Calls Are Clean
- **Command:**
  ```sh
  adb logcat -s ReactNativeFirebase:V *:S | grep "deprecated"
  ```
- **If any line still references `firebase.<service>()`, search the codebase:**
  ```sh
  grep -R "firebase()." src
  ```
- **Fix:** Convert those to `getXXX(getApp())`.

---

## 6. Turn Fabric/Bridgeless Back On
- **File:** `android/gradle.properties`
  ```properties
  newArchEnabled=true
  ```
- **File:** `ios/Podfile`
  ```ruby
  RCT_NEW_ARCH_ENABLED = '1'
  ```
- **Rebuild:**
  ```sh
  cd android && ./gradlew clean assembleDebug
  cd ios && pod install
  ```
- **If the white screen returns:** The remaining problem is a native new-arch incompatibility (often old third-party libraries).

---

## 7. If Nothing Above Reveals the Bug
- Run the profiler: `adb shell am profile start <PID> /tmp.trace` – if the trace stops when the white screen shows, a native crash occurred.
- Swap Hermes → JSC (`gradle.properties: hermesEnabled=false`) to check if the JS engine is the culprit.
- Create a fresh RN 0.78 project, copy your app/ code in pieces until it reproduces.

---

## Codebase References
- **index.js**: Add global error handler and ensure only one AppRegistry.registerComponent call.
- **src/App.tsx**: Add sentinel logs, pink view, and provider-by-provider re-enabling.
- **android/gradle.properties**: Toggle newArchEnabled and hermesEnabled.
- **ios/Podfile**: Toggle RCT_NEW_ARCH_ENABLED.
- **Metro/Terminal**: Watch for bundle delivery and errors.

---

> Walking this list usually pinpoints the first component that fails, which is nearly always a Promise inside a render, a mismatched style, or a lingering legacy Firebase call.
