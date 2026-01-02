# Android CI (APK build)

This repo includes a GitHub Actions workflow that builds Android APKs in the cloud and uploads them as artifacts.

## Workflow

- Workflow file: `.github/workflows/android-apk.yml`
- Triggers:
  - `push` to `main`
  - `pull_request`
  - manual `workflow_dispatch`

The workflow builds:
- Debug APK: `android/app/build/outputs/apk/debug/*.apk`
- Release APK: `android/app/build/outputs/apk/release/*.apk`

## Optional: Sign release builds

By default, the Android `release` build falls back to the debug keystore (not suitable for production).

To sign release builds with your own keystore, add these GitHub repo secrets:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded `.keystore` (or `.jks`) file
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

### Create the base64 secret locally

PowerShell example:

```powershell
$bytes = [System.IO.File]::ReadAllBytes("C:\path\to\release.keystore")
$base64 = [Convert]::ToBase64String($bytes)
$base64 | Set-Clipboard
```

Paste the clipboard value into the `ANDROID_KEYSTORE_BASE64` secret.

## Where to download the APK

In GitHub:
- Go to **Actions** → open a workflow run → **Artifacts** → download `android-apks-<sha>`.
