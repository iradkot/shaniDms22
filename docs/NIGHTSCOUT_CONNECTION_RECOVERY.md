# Nightscout connection checks and upgrade recovery

The Nightscout card is at the top of Settings. It offers connection testing,
editing the active source, and the timestamp of the latest sensor reading.
A saved source is not labelled as verified until a request succeeds. Empty
responses and readings older than ten minutes are explained separately.

## Updating from the previous app

Previous versions stored device-wide `nightscout.profiles.v1` records without
an account owner. The first Hub release moved those records into secure
quarantine while introducing account-scoped storage, but provided no recovery
action. This made a normal update appear to lose the Nightscout connection.

Settings now shows **Restore previous connection** when recoverable records
exist. The user confirms that the device's previous connections belong to the
currently signed-in account. Recovery verifies the saved credentials with
Nightscout before writing account-scoped metadata and secure credentials.
It keeps recovery data when verification fails and rejects work if the account
changes during the request. Credentials are never displayed by the card.

If the old connection is no longer recoverable, **Connect Nightscout** opens
the setup form. **Edit connection** opens the active profile and keeps its
saved secret when the secret field is left blank.

## Shared request contract

- `src/api/nightscoutAuthentication.ts` supplies native `api-secret` header
  authentication and the supported `secret` query parameter for the legacy
  browser client. Product web data continues to use its existing backend proxy.
- Connection checks use the same authentication as data loading, preserve
  sub-path installations, and request `/api/v1/entries/sgv.json` so a newer
  calibration entry cannot hide the last sensor reading.
- `src/api/nightscoutGlucose.ts` decodes readings for both checks and charts.
- `src/platform/native/bootstrap.js` installs URL support before app imports.
  Profile restoration must not depend on Firebase's transitive polyfill import.
- Configuration revisions refresh the native snapshot immediately when the
  source, account, or credential changes. The revision contains no credential.
- The Settings card uses the application's shared theme and a platform-neutral
  runtime. Typed failures become localised text without exposing server errors,
  request URLs, or credentials.

The authentication contract is documented in the [official Nightscout API
security guide](https://github.com/nightscout/cgm-remote-monitor/wiki/API-v1-Security)
and implemented by its [authorization middleware](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/authorization/index.js).

## Regression checks

```sh
yarn jest __tests__/platform/nativeGlucoseRestart.integration.test.tsx __tests__/nightscoutProfiles.nativeRuntime.test.ts __tests__/nightscoutLegacyRecovery.test.ts __tests__/nightscoutConnectionTest.test.ts __tests__/product/settings --runInBand
```

The native integration test seeds the exact previous-version storage format,
mounts the real provider, explicitly recovers the source, loads glucose through
the real API into Snapshot, Day Graph and Daily Overview, and restarts again.
Only the HTTP transport and native storage bridges are substituted. Additional
tests cover failed verification, account switching, retry, malformed responses,
stale readings, and the real Product Settings navigation path.
