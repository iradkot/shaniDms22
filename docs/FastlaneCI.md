# Fastlane CI Deployment

The repository ships with a Fastlane lane (`ios beta`) that can now be triggered from GitHub
Actions to build and ship the iOS app to TestFlight. This document explains the configuration
that is required to run the pipeline successfully and how to execute it.

## Required GitHub credentials

Configure the following repository credentials before running the workflow. Encrypted Secrets
are preferred; existing repository Variables with the same names remain supported. For each
name, the workflow uses the Secret when present and otherwise the Variable. Values that contain
binary content must be Base64 encoded.

| Secret or Variable | Description |
| --- | --- |
| `APPLE_CERTIFICATE_P12` | Base64 encoded distribution certificate exported as a `.p12` file. Generate the value with `base64 < certificate.p12 | pbcopy`. |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the distribution certificate above. |
| `APPLE_PROVISIONING_PROFILE` | Base64 encoded App Store provisioning profile (`.mobileprovision`) that matches `com.shanidms22` and is named `com.shanidms22 AppStore`. Encode with `base64 < profile.mobileprovision | pbcopy`. |
| `CI_KEYCHAIN_PASSWORD` | Password used to secure the temporary signing keychain that Fastlane creates on the GitHub runner. |
| `APP_STORE_CONNECT_KEY_ID` | The Key ID of an App Store Connect API key that has access to the app (App Manager role or higher). |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID for the App Store Connect API key. |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Base64 encoded contents of the `.p8` private key associated with the App Store Connect API key. Use `base64 < AuthKey_XXXXXX.p8 | pbcopy`. |

> **Note:** The workflow requires **all** of the values above. Double-check that `APPLE_CERTIFICATE_P12`
> and `APP_STORE_CONNECT_KEY_ID` are present as Secrets or Variables—without them the job will fail
> before the build starts.

`APP_STORE_CONNECT_PRIVATE_NOT_ENCODED_TO_64` may replace the Base64 private key, but do not
configure both forms.

The entry workflow (`ios-beta.yml`) passes the resolved values as secret inputs to the reusable
build workflow (`ios-beta-deploy.yml`). This registers them for masking before the runner logs
step environments, including values supplied through Variables. The build workflow also masks
the normalized Base64 private key and generated App Store Connect token.

Earlier workflows logged Variable-sourced credentials without masking. Rotate or reissue those
credentials, save the replacements as encrypted Secrets, and then delete the old Variables.
Merely copying an exposed value into Secrets does not rotate it.

The two non-secret runtime values below remain repository Variables. Keep the schema version at
`0` until the matching Firebase rules have been deployed and verified.

| Variable | Description |
| --- | --- |
| `SHANI_BACKEND_BASE_URL` | Optional HTTPS backend URL. The native app can derive the default Firebase Functions URL when omitted. |
| `FIRESTORE_RULES_SCHEMA_VERSION` | Set to `1` only after the matching production rules are deployed. `0` keeps remote writes disabled. |

> **Tip:** you can create the App Store Connect API key in **App Store Connect → Users and Access → Keys**.
Make sure the key has the **App Manager** role so it can upload builds to TestFlight.

## Optional Local Credentials

Local Fastlane runs continue to rely on your interactive Apple ID authentication. The new
CI-specific environment variables are only required when `CI=true` (e.g. on GitHub Actions).
If you want the GitHub workflow to use Apple ID credentials instead of an API key you can add
`FASTLANE_USER`, `FASTLANE_PASSWORD` (app-specific password) and `FASTLANE_SESSION` secrets and
Fastlane will pick them up automatically.

## Running the Workflow

1. Push the latest code (including both workflows) to GitHub and ensure the credentials are configured.
2. Navigate to **Actions → iOS Beta Deployment** in GitHub.
3. Click **Run workflow**. The workflow always runs the reviewed `beta` lane.
4. Monitor the job. The workflow will:
   - Run the full quality gate on a lower-cost Ubuntu runner.
   - Fail early on macOS when a required credential is absent from both Secrets and Variables.
   - Install Node.js dependencies with Yarn.
   - Install Ruby gems (CocoaPods and Fastlane).
   - Decode and install the signing assets into a temporary keychain.
   - Build the `shaniDms22` scheme with the `Release` configuration.
   - Verify that the signed IPA requests production APNs.
   - Preserve the IPA and Xcode archive as a GitHub Actions artifact, even when upload fails later.
   - Upload the generated build to TestFlight via the App Store Connect API key.

Successful runs will appear under TestFlight builds in App Store Connect.

## Native dependency lock

The macOS job uses `pod install --deployment`. Whenever a React Native package adds or changes an
iOS pod, run this on a Mac and commit the resulting lockfile before triggering CI:

```sh
cd ios
bundle install
bundle exec pod install --repo-update
git add Podfile.lock shaniDms22.xcworkspace
```

This rewrite adds native filesystem and Keychain packages, so `Podfile.lock` must be regenerated
on macOS before the first signed archive of the rewrite.
