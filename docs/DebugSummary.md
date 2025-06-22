# Debug Summary

Below is a summary of all the changes and debugging steps taken so far, along with my current understanding of the problem.

---

## 1. Initial Firestore Permission Error

**Error:**
```
NativeFirebaseError: [firestore/permission-denied]
The caller does not have permission to execute the specified operation.
```

**Action:**
- In `useGetSportItems.ts` added `enabled: Boolean(auth().currentUser)` to the React‑Query call.  
- This prevents Firestore reads before the user is authenticated.

**Result:**
- The permission‑denied error no longer appeared.

---

## 2. Login Flow Hanging on Emulator

**Symptom:**
- `AppInitScreen` used a custom `GoogleSignIn.getIsSignedIn()` which never resolved visibly.

**Action:**
- Replaced manual polling and navigation in `AppInitScreen.tsx` with `auth().onAuthStateChanged(...)`.  
- This automatically triggers navigation once Firebase auth state changes.

**Result:**
- The screen no longer hung on `await getIsSignedIn()`, but we saw a blank white screen after login.

---

## 3. GoogleSignIn Hook Type Fixes & Token Retrieval

**Issues:**
- `GoogleSignin.isSignedIn()` was not a function.  
- `SignInResponse` lacked `idToken` in typings.  
- Status‑code branches threw undefined‑`err.code` errors.

**Action:**
- Switched to `signInSilently()` for silent auth check.  
- Called `GoogleSignin.getTokens()` after `signIn()` to retrieve `idToken` + `accessToken`.  
- Simplified error handling to log and propagate errors directly.

**Result:**
- No more undefined‑code errors; Firebase credential flow succeeds.

---

## 4. Prevent Concurrent Sign-In Attempts

**Symptom:**
- Pressing the Google button twice resulted in `Sign-in already in progress`.

**Action:**
- Introduced a `loading` state in `Login.tsx` to disable the button during an ongoing sign‑in.

**Result:**
- No concurrent sign‑in errors.

---

## 5. Firestore Modular API Deprecation

**Warnings:**
```
Method called was `collection`. Please use `collection()` instead.
```

**Action:**
- Updated `SportService.ts` & `FoodService.ts` to use:
  ```ts
  import { getApp } from '@react-native-firebase/app';
  const db = getFirestore(getApp());
  ```

**Result:**
- Deprecation messages reduced (though some warnings persist until full modular migration).

---

## 6. Blank White Screen After Login

**Symptom:**
- After a successful login and navigation to the tabs, the UI area is completely blank.
- Only the Firebase deprecation warning appears in logs.

**Investigation Steps:**
1. **Navigator Style Bug**  
   - Found `sceneContainerStyle: { height: 30 }` in `MainTabsNavigator`.  
   - Changed to `flex: 1` so screens can fill the view.  
   - **Outcome:** Tab content area now sized correctly.

2. **Logging Instrumentation**  
   - Added `console.log` in:
     - `index.js` (component registration)  
     - `App.tsx` (mount/render)  
     - `AppInitScreen.tsx` (auth listener)  
     - `SportItemsProvider` (loading/error)  
     - `MainTabsNavigator` (render)  
     - `useGetSportItems` (currentUser)
   - Encountered Hermes microtask errors:
     > `Could not enqueue microtask because they are disabled in this runtime`
   - The debug logs themselves triggered `LogBox` errors and were not visible.

---

## Current Understanding & Next Steps

1. **Logging Issues**: Hermes appears to disallow microtasks in the LogBox render path, causing our console traces to crash internally. We need to:
   - Temporarily disable Hermes or use a logging library that doesn’t rely on microtasks.
   - Remove any console statements inside render JSX expressions.

2. **UI Hang**: If no logs appear after login (except deprecation), the navigation container or tabs are not rendering their children. Possible causes:
   - The provider hierarchy (`SportItemsProvider`, `TouchProvider`, `ThemeProvider`, `SafeAreaProvider`) might be blocking context or swallowing errors.
   - An exception in one of the top‑level components (e.g., Home) may fail silently.

**Next Actions**:
- Disable `Hermes` in `android/app/build.gradle` to check if logs appear correctly.  
- Wrap top navigator screens in error boundaries to catch hidden exceptions.  
- Simplify the tree by temporarily removing custom providers (e.g., `SportItemsProvider`) to isolate the blank screen culprit.
- Confirm that `AppInitScreen` actually resets to the correct route name matching `MainTabsNavigator`.

---

_End of summary._
