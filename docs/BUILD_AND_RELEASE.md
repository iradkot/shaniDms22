# Build and release

Use Node.js 22, the same runtime used by CI and Firebase Functions. Version
managers can read `.nvmrc` or `.node-version` from the repository root.
Android builds and Firebase emulator checks use Java 21; compatible version
managers can read `.java-version`.

## One command before every build

```sh
yarn verify:all
```

For faster work on the rewritten product surface only:

```sh
yarn verify:rewrite
```

`verify:all` rejects credential files in the current index, validates the iOS
release configuration and Metro output exclusions, runs strict TypeScript, lint, all Jest tests, the
Functions tests, authenticated Firestore and Storage emulator suites, and the
production Web build.

Metro excludes generated `releases/`, native build outputs, and `functions/lib/`
from its input/watch graph. This avoids rescanning artifacts and prevents a
Windows watcher race while another build replaces a generated directory.
`yarn verify:metro-config` checks these rooted exclusions without hiding source.
The Web build separately checks that safe-area components resolve to their Web
implementations; a native-only entry would render fullscreen content blank.

Audit deleted credential files separately:

```sh
yarn security:credential-history
```

This repository currently requires the rotation and history-cleanup runbook in
`docs/SECRET_ROTATION_AND_HISTORY_REWRITE.md` before a public release.

## Frontend bundles

```sh
yarn bundle:frontend:android
yarn bundle:frontend:ios
```

The outputs are written under `releases/frontend/`. These are production Metro
bundles consumed by the native apps.

## Web and tablet

```sh
yarn verify:web
yarn build:web
```

The deployable static site is written to `releases/web/`. It uses the shared
Product and domain modules, has a responsive two/three-column layout, supports
English/Hebrew RTL, and precaches the application shell for offline startup.
See `docs/WEB_FRONTEND.md` for the explicit browser capability boundary.

Do not advertise a capability as available on Web until its real platform
adapter exists. In particular, browser Nightscout and LLM access must go
through the approved backend proxy rather than exposing persistent credentials
to browser code.

## Android

```sh
# Development APKs, signed with the Android debug certificate
yarn build:android:debug

# Release-mode preview APKs, still signed with the debug certificate
yarn build:android:preview
```

Preview APKs are for internal installation only. Never upload them to Google
Play.

Before distributing a Firebase-sync preview, run the Firestore Emulator Suite
documented in `docs/FIRESTORE_JOURNAL_SYNC.md`. Production `firestore.rules`
must be deployed separately by an authorised operator; building an APK does not
deploy or relax backend rules.

Set these non-secret build values only after the matching backend is deployed:

```text
SHANI_BACKEND_BASE_URL=https://us-central1-PROJECT_ID.cloudfunctions.net/shaniApi
FIRESTORE_RULES_SCHEMA_VERSION=1
```

The backend URL can be omitted for the default Firebase project derivation. A
missing rules schema value keeps Firebase remote writes disabled and preserves
local-first use.

Production APKs and AABs require all four environment variables:

```text
ANDROID_KEYSTORE_PATH
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Then run:

```sh
yarn build:android:release
yarn build:android:aab
```

The GitHub workflows use the equivalent encrypted Secrets plus
`ANDROID_KEYSTORE_BASE64`. Their signing routes are explicit:

- **Android APK (Lite):** pushes to `main` and pull requests build an internal,
  debug-certificate preview for `arm64-v8a`. Manual runs default to `preview`;
  select `production` to require release signing.
- **Android APK (Full):** manual runs default to `production`. Select `preview`
  explicitly for an internal build covering all common Android ABIs.

Both routes run `yarn verify:all` before building. Workflow names, step summaries,
and artifact names identify preview builds. Preview version names end in
`-preview`. Production fails if any signing secret is missing and explicitly
disables debug signing; it never switches to preview automatically.

Both workflows generate one version code immediately before the build and reuse
it for every APK in that build:

```text
versionCode = 30000000 + UTC seconds elapsed since 2026-01-01 00:00:00
```

The shared time-based sequence avoids the independent run counters of the Lite
and Full workflows. Its baseline is above the previously installed version code
`20260906`, so new previews can update that installation without a version
downgrade. Builds generated in the same second have the same code. CI rejects
codes outside Android's supported range. An in-place update also requires the
same application ID and signing certificate; production and preview certificates
are not interchangeable.

## iOS / TestFlight

iOS builds require macOS and Xcode. From macOS:

```sh
yarn publish_testflight
```

The GitHub workflow runs the same Fastlane `ios beta` lane. Keep certificates,
profiles, App Store Connect keys, and passwords only in encrypted GitHub
Secrets. The workflow intentionally does not fall back to repository Variables.

After adding or upgrading a native dependency, regenerate and commit
`ios/Podfile.lock` on macOS. CI uses `pod install --deployment` so an unreviewed
dependency resolution cannot silently change a signed build.

Required CI Secrets:

```text
APPLE_PROVISIONING_PROFILE
APPLE_CERTIFICATE_P12
APPLE_CERTIFICATE_PASSWORD
CI_KEYCHAIN_PASSWORD
APP_STORE_CONNECT_KEY_ID
APP_STORE_CONNECT_ISSUER_ID
APP_STORE_CONNECT_PRIVATE_KEY
```

Optional GitHub Variables configure the deployed application runtime:

```text
SHANI_BACKEND_BASE_URL
FIRESTORE_RULES_SCHEMA_VERSION
```

`APP_STORE_CONNECT_PRIVATE_NOT_ENCODED_TO_64` is supported as an alternative to
the base64 private key. Do not configure both.

Use `ios/fastlane/.env.example` only as a local template. Never commit its real
copy.
