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
- Enters Product Experience directly without contacting Firebase auth.
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
- Rebuilt calendar flow: `e2e/maestro/day-graph-calendar.yaml`
- Nightscout scan flow: `e2e/maestro/nightscout-scan.yaml`
- Oracle events flow: `e2e/maestro/oracle-events.yaml`

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

Use a dedicated test emulator. Check `adb -s DEVICE_ID shell dumpsys user` for
`RUNNING_UNLOCKED` before starting Maestro. `sys.boot_completed=1` is not enough
when an existing emulator has a PIN: instrumentation can fail with “not
encryption aware” while Android is still in Direct Boot. Use a fresh test AVD
instead of wiping a personal emulator or changing its screen lock.

### 3) Build + install an E2E-enabled APK

From the repo root:

`cd android; $env:E2E='true'; .\gradlew.bat :app:assembleRelease`

Install the APK:

`$apk = Get-ChildItem -Path .\app\build\outputs\apk\release\*.apk | Select-Object -First 1; adb install -r $apk.FullName`

### 4) Run the Maestro flows

From the repo root:

`yarn e2e:maestro:android`

Run only the smoke flow (login + tabs):

`yarn e2e:maestro:android:smoke`

Or run with the repo wrapper (recommended; includes summary + step analytics):

`yarn e2e:maestro:android:summary`

Or directly:

`maestro test e2e/maestro`

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

The Product Hub and rebuilt Day Graph calendar flows run explicitly before the
legacy suite excludes the `product` tag. `__tests__/e2e/productFlowCoverage.test.ts`
guards against adding a Product flow that CI silently skips.
CI preserves the calendar JUnit report, screenshots and run output for 14 days,
including failed runs, as a `day-graph-calendar` artifact.

## Rebuilt Day Graph calendar

Use an E2E-enabled APK on a dedicated emulator. The bootstrap uses the real
Product Hub/Personal Home navigation and the synthetic glucose adapter. It does
not use the legacy-screen bridge or require a Google/Nightscout login.

```sh
maestro --device emulator-5580 test e2e/maestro/day-graph-calendar.yaml --test-output-dir=e2e/results/calendar
```

Replace the device ID with the explicitly chosen test emulator. The flow clears
the app's local state; never run it on a personal installation with real data.
An E2E APK is a fixture-only test artifact, not a preview to distribute.

The flow selects February 29, 2024, checks recorded-readings summaries, browses
months without changing the selected day, reopens the calendar, tests Close and
Android Back, and verifies Today disables forward navigation. It uses selection
and enabled states, avoiding locale/host-timezone-dependent date comparisons.

## Troubleshooting

- **Maestro can’t find an element**: add/adjust `testID` (prefer this over text selectors).
- **App shows system dialogs**: confirm you built with `E2E=true`.
- **E2E lands on login**: confirm `BuildConfig.E2E` is true in the installed APK;
  no Firebase anonymous-auth setup is required for the Product test entry.
- **Maestro fails before any flow action**: keep tool installations isolated.
  Extracting a new release over an old `lib/` can leave duplicate versioned CLI
  JARs. Install into a new directory and invoke that exact binary before changing
  app code. Keep the failed run log separate from the UI-test result.
- **Windows `KeyValueStore.withFileLock` / `File.readLines` error**: the
  [upstream Windows issue](https://github.com/mobile-dev-inc/maestro/issues/3414)
  reports a self-conflicting file lock in newer versions and a working 2.5.1
  baseline. This session also reproduced it with a clean 2.10.0 install. Use a
  separate official 2.5.1 installation for the local Windows run; do not delete
  the global session database or change app logic to address this tool failure.
