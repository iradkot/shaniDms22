# Pilot implementation handoff — 2026-10-03

The code changes for the four requested workstreams are implemented. The first preview's verification and delivery are recorded below. A later main integration and independent deletion review are being verified separately; the original APKs do not include those later fixes. Provider-side credential rotation and physical/live-data acceptance remain incomplete. This handoff does not establish readiness to distribute to people with type 1 diabetes. No backend, rules, IAM, Hosting, or store deployment was performed.

The candidate is a restricted internal Android preview. It uses the Android debug certificate, even though it runs in release mode. It is not a Google Play release. Keep the cloud rules schema at **0** until the matching backend, schema **2** rules, and service-account permissions have been deployed and verified.

## Four requested changes

| Change | Implemented behavior | Details |
| --- | --- | --- |
| 1. Read-only Nightscout onboarding | New connections require a persistent subject access token. Verification checks effective permissions, including the site's default roles, rejects write/admin grants, and reads actual glucose entries. Native/background requests retain the raw token in the supported header. Credentials stay in account-scoped protected storage or the encrypted server vault. Existing master-secret connections remain clearly marked as legacy and require reconnection for verified read-only use. | [Nightscout pilot setup](NIGHTSCOUT_READ_ONLY_PILOT.md) and [connection recovery](NIGHTSCOUT_CONNECTION_RECOVERY.md). |
| 2. Privacy, separate consent, and account deletion | Hebrew/English policy describes device, Firebase, Nightscout proxy, and OpenAI processing. Cloud and AI choices start unchecked. Withdrawal blocks new transmissions and retains a pending marker on failure. Account deletion uses recent sign-in, an owner-bound recovery receipt, a server deletion lock, and owner-specific cloud/local cleanup. Credential, image, and cache operations are blocked/drained to prevent late writes from recreating deleted data. | [Privacy and deletion](PILOT_PRIVACY_AND_DELETION.md). Server enforcement depends on the pending deployment below. |
| 3. Restricted pilot AI and forecast capabilities | Pilot is the default immutable build channel. Current/pre-meal AI recommendations and experimental glucose forecasts are disabled at UI and execution boundaries, including old routes/history, async completions, browser adapters, background refresh, and Android widgets. Measured graphs, journals, and retrospective analysis remain. Retrospective AI is still not clinically validated and must not be used for treatment or dose decisions. Development experiments remain available only in explicitly configured internal builds. | [Pilot release policy](PilotReleaseSafety.md) and [AI recommendations](AIRecommendations.md). |
| 4. Repeatable Android acceptance checks | A dedicated-emulator runner and native instrumentation checks cover installation/upgrade, offline launch, denied notification permission, process restart/reboot, stale/missing readings, missing insulin, and removal of retained experimental forecasts. Build tooling separates pilot/development channels and rejects development under production signing. Web publishing rejects a missing/development build manifest before credentials or network access. | [Build and release](BUILD_AND_RELEASE.md), [E2E checks](E2E.md), and [web deployment](WebDeployment.md). Exact execution results are pending below. |

## Remaining release blockers

1. **Deploy and verify the privacy backend and schema 2 rules.** The new code has not been deployed. Deploy the consent/deletion backend together with `firestore.rules` and `storage.rules`; then verify missing/withdrawn consent, cross-owner denial, deletion locks, receipt recovery, proxy access, and image cleanup against the intended project. Schema **1** is insufficient. Keep native `FIRESTORE_RULES_SCHEMA_VERSION` absent/0 and browser `firestoreRulesSchemaVersion`/`VITE_FIRESTORE_RULES_SCHEMA_VERSION` at 0 until verification succeeds. Cloud sync, image remotes, and browser cloud features must remain gated. Follow [Privacy and deletion](PILOT_PRIVACY_AND_DELETION.md) and the [backend runbook](BACKEND_DEPLOYMENT.md).

2. **Review the runtime IAM permissions needed for deletion.** The deployed runtime service account needs `firebaseauth.users.delete`, `datastore.entities.list`, and narrowly scoped `storage.objects.list`/`storage.objects.delete` on the configured image bucket. Verify Firebase Storage's cross-service access to Firestore rules documents. Preserve existing KMS encryption/decryption access. No IAM changes were made. See the exact inspected gaps in [Privacy and deletion](PILOT_PRIVACY_AND_DELETION.md#deployment-prerequisites-pending).

3. **Complete physical-device and live-data acceptance.** Emulator/synthetic checks cannot establish real Google sign-in, live CGM updates, Nightscout token revocation, account switching, background reliability, or overnight notification behavior. None of those physical/live-CGM/overnight checks has been completed in this work. Test installation and upgrade on a disposable test phone, connect a real read-only Nightscout source, exercise offline/reboot/screen-off behavior, and verify consent withdrawal and interrupted deletion with a disposable account. The app must not replace the existing sensor/pump alert system.

4. **Rotate exposed credentials and complete coordinated Git cleanup.** History inspection identified Google OAuth client secrets and Apple Fastlane account/application-specific passwords. The later merge review also found sensitive Apple CI material in unencrypted Actions Variables; a metadata inspection accidentally printed those values to the review transcript. Provider-side rotation/revocation remains unverified. Removing current files or building a new APK does not resolve that exposure. Follow [Credential rotation and history cleanup](SECRET_ROTATION_AND_HISTORY_REWRITE.md). Production signing/history gates remain separate from internal preview builds.

5. **Use the intended distribution signing and finish the public policy details.** The preview uses a debug certificate and is for internal installation. A production APK/AAB needs the controlled release keystore and the required signing configuration. Review operator/contact details and publish the policy URL before store distribution. Final verification must identify the exact artifact and certificate; see [Build and release](BUILD_AND_RELEASE.md).

## Local deletion limitation

Account cleanup removes caches whose ownership is provable from profiles, saved source indexes, or owner-stamped records. It preserves another account's data. Historical files and opaque caches created before ownership indexes existed may have no reliable owner, so they are preserved. Old Oracle caches have no guaranteed automatic expiry. This is disclosed in the bilingual policy and the [Nightscout pilot notes](NIGHTSCOUT_READ_ONLY_PILOT.md).

Clearing app storage or the site's browser storage removes all local copies, including other accounts' local data on that device. Other offline devices and provider logs/backups may retain previous copies. Deleting ShaniDms does not delete Nightscout, the user's Google account, or original sensor/pump records.

## Validation results — completed on 2026-10-03

| Evidence | Final result |
| --- | --- |
| Verified working-tree revision / timestamp | Base commit `b5921e13fda8cf377da0284d379c7a0115bcd9b6`; modified working tree including pre-existing work. APK build configuration recorded at `2026-10-02T23:11:21Z` (2026-10-03 in Jerusalem). No release commit was made. |
| `yarn verify:all` result and log path | Passed, exit 0. [Full log](../artifacts/pilot-qa/verify-all-final.log). |
| Type checks, lint, complete Jest suite | Both native/product and web TypeScript checks passed. 291 Jest suites / 1,796 tests passed, one snapshot passed. Lint: 0 errors, 350 warnings. Calendar's 118 tests and 8 focused checks also passed; these overlap the full suite and are not additional totals. |
| Functions and Firestore/Storage emulator suites | 91 Functions tests, 29 Firestore rule tests, and 4 Storage rule tests passed. Rule runner pins Firebase CLI 13.35.1; Storage checks run Firestore and Storage together. |
| Restricted web build and artifact manifest | Passed. `releases/web/.shani-release.json` records version 1 / channel `pilot`. Seven build/publishing checks passed. Existing large-chunk and classic runtime-config script notices remain. Nothing was published. |
| Android native build and unit tests | Release-mode preview and release instrumentation APK built successfully. 50 JVM tests passed with zero failures/errors. [Build log](../artifacts/pilot-qa/pilot-build.log), [unit results](../artifacts/pilot-qa/native-unit-results.json). |
| APK path, version/build ID, size, SHA-256 | Version `1.0.20261003-pilot-preview`, code `53757081`. Both architecture APKs are listed below. [Hash manifest](../artifacts/pilot-qa/apk-hashes.json). |
| APK signing certificate / SHA-256 | `apksigner verify` passed for both APKs. Android Debug certificate: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Internal installation only. |
| APK release channel and rules schema | Restricted `pilot`, experiments false, E2E login bypass false, rules schema 0. Native acceptance reads the installed BuildConfig by reflection and exercises the actual forecast gate. `aapt2` confirms Firebase messaging auto-init is false in the packaged manifest. [Build configuration](../artifacts/pilot-qa/build-config.json), [packaged manifest](../artifacts/pilot-qa/apk-manifest.txt). |
| Emulator serial/API level and installation/upgrade baseline | Dedicated `ShaniPilotQAApi35_20261003`, serial `emulator-5580`, Android API 35. Upgraded using `adb install -r` from `baseline-1.0.379-preview-x86_64.apk`; no app-data reset. No signed-in health data existed in this test installation. |
| Native instrumentation and Android smoke report/screenshots | 15/15 Android instrumentation tests passed: 3 pilot checks and 12 real widget checks. 6/6 smoke stages passed: baseline install, version upgrade, notification permission denied, offline cold launch, process restart, and device reboot. [Instrumentation](../artifacts/pilot-qa/native-instrumentation.log), [smoke report](../artifacts/pilot-qa/android-smoke/report.json), [installed app](../artifacts/pilot-qa/android-smoke/installed.png), [native widget captures](../artifacts/pilot-qa/widget-summary-qa/). |
| Hebrew pre-login privacy UI | Two additional exact-APK UI checks passed on the dedicated emulator. The Hebrew policy entry is visible before sign-in; the read-only Hebrew policy opens without Google authentication. Visually inspected the [Hebrew policy](../artifacts/pilot-qa/android-smoke/privacy-he.png) and [minimum Hebrew widget](../artifacts/pilot-qa/widget-summary-qa/minimum-he.png). [UI report](../artifacts/pilot-qa/android-smoke/privacy-ui-report.json). |
| Physical device, live CGM, overnight notifications | Not performed; remains a distribution blocker. |
| Backend/rules/IAM deployment and credential rotation | Not performed; remains a distribution blocker. |

Record failures and untested cases alongside successful checks. Automated test success confirms only the behavior exercised; it is not clinical validation or confirmation of a live deployment.

The first native build exposed a manifest conflict with the Firebase library's default auto-init setting. The app now explicitly overrides that value; the rebuilt APK and packaged manifest passed. The first smoke attempt stopped at the older fixture's second-denial permission dialog. The runner was updated from the observed dialog ID; the same final APK then passed all six stages. That earlier failed attempt is retained in `artifacts/pilot-qa/android-smoke/baseline-fixture-first-attempt.json`. These fixes affected the Android manifest/test runner; the final native build and exact-APK acceptance checks validate them after the full JavaScript/web pipeline.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [ARM64 phone APK](../releases/pilot-20261003/ShaniDms-1.0.20261003-pilot-preview-arm64-v8a.apk) | 32,443,706 | `4e5a8d0deab254be26bc2238fc4cb73b6edacc636672cedb3d7f91e8feb39b9c` |
| [x86_64 emulator APK](../releases/pilot-20261003/ShaniDms-1.0.20261003-pilot-preview-x86_64.apk) | 32,684,085 | `b60fd21b489d6c67cd2a2a0bdd379fb25f08ffa133ea74709380768532a37a12` |

No iOS build or physical-device test was performed on this Windows host. The ARM64 package was built and its signature inspected; exact-APK device acceptance ran against x86_64 on the emulator.

## Delivery

Download links for both final APKs were emailed to `irad16@gmail.com`, as requested by the standing delivery instruction. Gmail confirmed message `1a0fef3253a9a887` with the `SENT` label. The files are links rather than email attachments.

Drive connector upload was denied because its OAuth scope permits no file creation. Browser upload also lacked the extension's file-URL permission. No connection or extension permissions were expanded. Instead, both APKs were uploaded with the existing authenticated project account to `gs://shanidms-3a065.appspot.com/internal-pilot-releases/2026-10-03-53757081/`. No IAM or public-access change was made. Read-back size and MD5 match both local files; object ACLs confirm the recipient account is an owner and contain no public principal. The Cloud console also shows **Not public**.

- [ARM64 authenticated download](https://storage.cloud.google.com/shanidms-3a065.appspot.com/internal-pilot-releases/2026-10-03-53757081/ShaniDms-1.0.20261003-pilot-preview-arm64-v8a.apk).
- [x86_64 authenticated download](https://storage.cloud.google.com/shanidms-3a065.appspot.com/internal-pilot-releases/2026-10-03-53757081/ShaniDms-1.0.20261003-pilot-preview-x86_64.apk).

Open while signed in as `irad16@gmail.com`. These use Google's [authenticated browser download endpoint](https://docs.cloud.google.com/storage/docs/request-endpoints#authenticated_browser_downloads). [Delivery metadata](../artifacts/pilot-qa/delivery-artifacts.json) records storage generations, local paths, hashes, and verified access. Uploading internal APK files did not deploy the application, backend, rules, or Hosting.
