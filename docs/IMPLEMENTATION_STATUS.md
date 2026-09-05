# Implementation and delivery status — 2026-09-05

The shared V1 product surface is implemented and produces Web, Android, and
iOS frontend artifacts. This records code/build readiness, not production
deployment or a signed iOS release.

## Implemented product surface

| Area | Implementation |
| --- | --- |
| Navigation | Hub, Back/Hub/Forward history, optional shortcuts, typed contextual destinations |
| Hub | Colorful compact tiles, responsive columns, favorites, recents, optional current snapshot |
| Personalization | Questionnaire, editable favorites, hidden modules, device-size layout profiles, offline persistence and sync adapters |
| Languages | English, Hebrew, RTL in the shared product views |
| Day Graph | Reused rich glucose/bolus/basal/IOB/COB charts, fullscreen, remembered chart defaults per form factor, mouse/touch inspection, timeline |
| Analysis | Daily overview, previous-day/night summary, Trends Hub, AGP/daily profiles, period comparison, therapy context, hypo investigation, similar events, Loop changes |
| Journal | Separate Meals and Activity views over a shared offline-first engine, explicit external links, conflicts, trash, images and Firebase adapters |
| AI | General chat and specialist destinations; advisory-only tools, account/workspace isolation, backend proxy |
| Updates | Alert rules, Update Center, contextual navigation and native notification integration |
| Platforms | Shared product/domain code with native and browser adapters; static offline Web shell |

The accepted decisions remain in `CONTEXT.md` and `docs/adr/`. Browser
background push is outside the V1 capability set, as recorded in
`docs/WEB_FRONTEND.md`.

## Latest continuation — chart experience

- Added fullscreen using the existing rich charts, with English/Hebrew controls,
  safe-area support, a compact landscape toolbar, and a selected-day label.
  Opening/closing it preserves mode, zoom, and window position. Android Back
  and browser Escape close the overlay without leaving the Day Graph.
- Added an explicit **Remember this view** action. Detailed/combined mode and
  full-day/3/6/12-hour windows are saved locally in the active Phone, Tablet, or
  Desktop Layout Profile. An event focus or temporary zoom is never auto-saved.
- Chart settings use the existing offline-first repository and independent
  layout sync documents. Strict parsers and Firestore rules reject timestamps,
  medical values, credentials, and unsupported chart settings.
- Saves are atomic against current preferences. Save failures leave the chart
  usable and can be retried. Late saves do not reset newer exploration or a
  different account/layout. Hub customization preserves remembered chart settings.
- Native phone/tablet classification now uses the shorter viewport dimension,
  so rotating a phone does not select its tablet preferences.
- Added Web mouse inspection using the same chart timestamp calculation as touch.
  A floating inspector avoids moving the plot as the pointer moves. Scrubbing
  does not select axis labels as text.
- Split the IOB total from its smaller, localized bolus/basal detail. A missing
  component stays unknown rather than being presented as zero.
- Fixed the Web safe-area dependency entry that caused an empty fullscreen view.
  The Web build now rejects native-only safe-area components automatically.
- Excluded generated release/build folders from Metro. This fixes a reproduced
  Windows watcher failure when Web replaces its output during an iOS bundle.

Verification for this continuation:

- 933 Jest tests across 190 suites; strict native/Web TypeScript checks passed.
- 31 backend, 26 Firestore rules, and 3 Storage rules tests passed.
- 2 Web platform-boundary and 3 Metro output-boundary checks passed.
- Targeted lint is clean; broad rewrite lint retains 356 existing warnings and
  zero errors. Web build/service-worker verification passed.
- Browser visual/interaction checks covered 320/390px phones, 768px tablet,
  844px landscape, and 1200px desktop, English/Hebrew, fullscreen, explicit
  save/reopen, Escape, mouse inspection, and no browser error logs.
- Android release-mode preview and Android/iOS frontend bundles built. The ARM64
  APK signature and package/version metadata were verified. A new native
  install/launch smoke test is still not completed.

Artifacts: `releases/chart-experience-2026-09-05/`.
Logs: `releases/qa/chart-experience-*.log`.

## Previous delivery — graph restoration

- Added 3-, 6- and 12-hour chart windows, with bounded earlier/later navigation.
- Timeline actions focus the chart immediately; Journal detail opens through
  an explicit action. Summary and investigation links retain their event time.
- Manual refresh retains visible data. Today's graph also refreshes every five
  minutes while active and when the application returns to the foreground.
- A failed refresh preserves the last loaded snapshot and displays its failure.
  Switching source/day never presents a late response from the previous scope.
- Web daily and previous-day insulin summaries reuse the established delivery
  calculation, including basal carryover and range-bounded boluses.
- Missing/stale insulin evidence remains unavailable rather than becoming zero.
- Treatment outages preserve CGM and locally saved Journal entries.
- Partial IOB/COB request failures preserve successful time windows.
- Basal profiles survive an offline cache round trip. Malformed or ambiguous
  schedules are rejected as a whole.
- Only identical external treatment IDs are deduplicated; separate records with
  the same time and amount remain separate.
- The browser current snapshot omits old IOB/COB values that do not match its
  recent glucose reading.
- Fixed duplicate and clipped chart time labels exposed by the new zoom controls.

## Previous delivery verification

- 900 Jest tests passed across 186 suites after all final changes.
- 31 backend tests passed.
- 25 Firestore rules tests and 3 Storage rules tests passed against local emulators.
- Native rewrite and Web strict TypeScript checks passed.
- The changed chart/data-source area is lint-clean. The broad rewrite lint has
  zero errors and 356 pre-existing warnings elsewhere.
- Tracked-credential and iOS release-configuration checks passed.
- Web build and service-worker verification passed; Android/iOS frontend bundles built.
- Android release-mode preview assembly passed for four ABIs.
- Browser visual checks covered Hebrew phone/tablet views, zoom, window movement,
  combined/detailed charts, and no browser error logs or horizontal page overflow.
- A read-only Android 15 emulator cold-booted, but ADB remained unauthorized.
  A fresh install/launch smoke test was therefore not completed for this artifact.

Logs are in `releases/qa/implementation-*.log`. Distribution artifacts are in
`releases/implementation-2026-09-05/`.

## Remaining release operations

The latest APK is an internal debug-signed preview, version `1.0.20260905.2-preview`
(`20260906`). Its compiled `FIRESTORE_RULES_SCHEMA_VERSION` is **0**. Local
first use remains enabled; remote Journal/Personalization/Alerts writes are not
activated by this binary. Activate them only after deploying and verifying the
matching backend and rules, then build with schema version 1.

The encrypted vault/AI/Web proxy needs the deployed backend, KMS configuration,
and allowed Web origin described in `docs/BACKEND_DEPLOYMENT.md`. No production
backend or hosting deployment was performed in this delivery.

A signed iOS IPA still requires macOS/Xcode and the Fastlane CI prerequisites in
`docs/BUILD_AND_RELEASE.md`. Public/store release also retains the credential
rotation/history-cleanup prerequisite already recorded in
`docs/SECRET_ROTATION_AND_HISTORY_REWRITE.md`.
