# Native Nightscout vault synchronization

Android and iOS keep Nightscout as a local-first connection. Saving, editing,
switching, or deleting a profile completes against local storage first. The
backend vault update then runs in the background.

## Security boundary

- Profile metadata stays in AsyncStorage.
- The usable SHA1 Nightscout credential stays in Keychain/Keystore.
- The durable sync outbox is scoped by Firebase UID.
- An outbox value contains only `{schemaVersion, revision}`. It never contains
  a Nightscout URL, profile ID, or credential.
- Every retry re-reads the current active profile through
  `loadNightscoutProfiles()`. It does not replay a captured secret.
- Backend requests bind the expected UID to the current Firebase session before
  sending anything.

The outbox key format is:

```text
nightscout.vault.reconcile.v1:<encoded Firebase UID>
```

## Reconciliation behavior

The outbox records desired-state reconciliation, not separate upload/delete
commands. At retry time:

- A valid active local profile provisions `/v1/vault/nightscout/provision`.
- No local profile removes `/v1/vault/nightscout/remove`.
- Existing local metadata with an unavailable secure credential fails safely;
  it does not remove the server credential.
- Newer changes increment the revision. An older in-flight response may clear
  only the exact revision it processed, so rapid edits coalesce to the latest
  local state.

Retries happen on startup, sign-in, app foreground, local profile changes, and
explicit `retryVaultSync()` calls. Network errors leave the intent durable.

## UI state

`useNightscoutConfig()` exposes `vaultSyncStatus` and `retryVaultSync()`.
Possible states are `idle`, `pending`, `syncing`, and `error`. A vault failure
does not clear or disable the locally configured Nightscout client.

E2E builds keep the same queue lifecycle but use a deterministic no-network
vault adapter.
