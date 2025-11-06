# Fastlane CI Deployment

The repository ships with a Fastlane lane (`ios beta`) that can now be triggered from GitHub
Actions to build and ship the iOS app to TestFlight. This document explains the configuration
that is required to run the pipeline successfully and how to execute it.

## Required GitHub Secrets or Variables

Create the following repository secrets **or** repository variables before running the workflow.
The workflow automatically prefers a repository variable if it exists and falls back to a secret
with the same name. Values that contain binary content must be Base64 encoded so they can be
injected as plain text at runtime.

| Secret / Variable | Description |
| --- | --- |
| `APPLE_CERTIFICATE_P12` | Base64 encoded distribution certificate exported as a `.p12` file. Generate the value with `base64 < certificate.p12 | pbcopy`. |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the distribution certificate above. |
| `APPLE_PROVISIONING_PROFILE` | Base64 encoded App Store provisioning profile (`.mobileprovision`) that matches `com.shanidms22` and is named `com.shanidms22 AppStore`. Encode with `base64 < profile.mobileprovision | pbcopy`. |
| `CI_KEYCHAIN_PASSWORD` | Password used to secure the temporary signing keychain that Fastlane creates on the GitHub runner. |
| `APP_STORE_CONNECT_KEY_ID` | The Key ID of an App Store Connect API key that has access to the app (App Manager role or higher). |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID for the App Store Connect API key. |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Base64 encoded contents of the `.p8` private key associated with the App Store Connect API key. Use `base64 < AuthKey_XXXXXX.p8 | pbcopy`. |

> **Note:** The workflow requires **all** of the values above. Double-check that `APPLE_CERTIFICATE_P12`
> and `APP_STORE_CONNECT_KEY_ID` are present—without them the job will fail before the build starts.

> **Tip:** you can create the App Store Connect API key in **App Store Connect → Users and Access → Keys**.
Make sure the key has the **App Manager** role so it can upload builds to TestFlight.

## Optional Local Credentials

Local Fastlane runs continue to rely on your interactive Apple ID authentication. The new
CI-specific environment variables are only required when `CI=true` (e.g. on GitHub Actions).
If you want the GitHub workflow to use Apple ID credentials instead of an API key you can add
`FASTLANE_USER`, `FASTLANE_PASSWORD` (app-specific password) and `FASTLANE_SESSION` secrets and
Fastlane will pick them up automatically.

## Running the Workflow

1. Push the latest code (including this workflow) to GitHub and ensure the secrets are configured.
2. Navigate to **Actions → iOS Beta Deployment** in GitHub.
3. Click **Run workflow** and confirm the lane value (defaults to `beta`).
4. Monitor the job. The workflow will:
   - Install Node.js dependencies with Yarn.
   - Install Ruby gems (CocoaPods and Fastlane).
   - Decode and install the signing assets into a temporary keychain.
   - Build the `shaniDms22` scheme with the `Release` configuration.
   - Upload the generated build to TestFlight via the App Store Connect API key.

Successful runs will appear under TestFlight builds in App Store Connect.
