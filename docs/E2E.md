# E2E Testing (Maestro)

This repo uses **Maestro** for Android E2E smoke tests.

## Goals

- Keep E2E tests stable and deterministic.
- Avoid flaky system dialogs (push permission prompts).
- Avoid real Google sign-in UI automation in CI.
- Scale to a large E2E suite by relying on stable `testID` selectors.

## E2E Mode

Android builds can enable an E2E flag at build time:

- Build flag: `E2E=true`
- Native constant: `BuildConfig.E2E`
- JS access: `NativeModules.E2EConfig.isE2E` (via a small native module)

When E2E mode is enabled, the app:

- Skips notification permission prompts (Notifee + FCM).
- Skips device token register/sync/unregister logic.
- Performs a deterministic auth path (anonymous Firebase auth) from the init screen.
- Shows a test-only `E2E Login` button on the login screen.

JS helper: `isE2E` from `src/utils/e2e.ts`.

## Selector Convention

Use `testID` for everything E2E interacts with.

Recommended naming:

- Screens: `screen.<name>`
- Tabs: `tab.<name>`
- Login controls: `login.<control>`

This repo already defines the basic smoke selectors:

- `login.e2eButton`, `login.googleButton`, `login.screen`
- `tabs.navigator`
- `tab.home`, `tab.trends`, `tab.food`, `tab.sport`, `tab.notifications`
- `screen.home`, `screen.trends`, `screen.food`, `screen.sport`, `screen.notifications`

Source of truth for selector strings:

- `src/constants/E2E_TEST_IDS.ts`

## Maestro Flows

Maestro flows live under `e2e/maestro/`.

- Smoke flow: `e2e/maestro/login-and-tabs.yaml`
- Charts smoke flow: `e2e/maestro/charts-smoke.yaml`

## Run Locally (Windows)

### 1) Install Maestro

On Windows, install Maestro by downloading the latest release zip and adding it to your PATH.

Alternatively, use the repo helper script (recommended):

`yarn e2e:maestro:install:win`

(or directly: `powershell -ExecutionPolicy Bypass -File scripts/install-maestro-windows.ps1`)

1) Download `maestro.zip`:

`https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip`

2) Extract it somewhere (example):

`C:\Users\<you>\maestro`

3) Add the `bin` folder to PATH (example):

`setx PATH "%PATH%;C:\Users\<you>\maestro\bin"`

4) Restart your terminal and verify:

`maestro --version`

### 2) Start an emulator

Use Android Studio’s Device Manager to start an emulator, or use the SDK tools.

Verify ADB sees a device:

`adb devices`

### 3) Build + install an E2E-enabled APK

From the repo root:

`cd android; $env:E2E='true'; .\gradlew.bat :app:assembleRelease`

Install the APK:

`$apk = Get-ChildItem -Path .\app\build\outputs\apk\release\*.apk | Select-Object -First 1; adb install -r $apk.FullName`

### 4) Run the smoke flow

From the repo root:

`yarn e2e:maestro:android`

Or run with the repo wrapper (recommended; includes summary + step analytics):

`yarn e2e:maestro:android:summary`

Or directly:

`maestro test e2e/maestro/login-and-tabs.yaml`

Or use the repo helper script (build + install + run):

`powershell -ExecutionPolicy Bypass -File scripts/run-maestro-android.ps1`

## CI

GitHub Actions workflow:

- `.github/workflows/e2e-android-maestro.yml`

It:

- Builds `assembleRelease` with `E2E=true`
- Boots an emulator
- Installs the APK
- Runs the Maestro flow(s)

## Troubleshooting

- **Maestro can’t find an element**: add/adjust `testID` (prefer this over text selectors).
- **App shows system dialogs**: confirm you built with `E2E=true`.
- **Auth doesn’t advance to tabs**: check Firebase anonymous auth is enabled in your Firebase project.
