# Journal Firebase sync gate

The Journal core has an offline-first local store, durable outbox, strict remote
codecs, idempotent transport contract, pull cursor, merge handling, and
owner/Workspace path policy.

Native Firebase Journal sync is enabled behind a fail-closed build capability.
The authenticated Emulator Suite covers valid create/update/purge,
same-owner reads, cross-owner and unauthenticated denial, stale revisions,
immutable operation records, paired atomic writes, and default-deny roots.

Run the checked-in command:

`yarn test:rules:firestore`

The repository pins a Java-17-compatible Firebase CLI for this suite.

The intended path is:

`users/{firebaseUid}/workspaces/{workspaceId}/journalEntries/{entryId}`

Idempotency records use the sibling `journalOperations` collection. Entry
documents are small revision heads that point to immutable operations. Raw
Nightscout history, cached external values, local image URIs, and credentials
are excluded by the strict runtime projection and codecs. Rules independently
enforce authenticated owner/Workspace paths, top-level document allowlists,
atomic head-operation pairing, immutable operations, and default deny.

Deploy `firestore.rules` before distributing a sync-enabled build. Only then
set `FIRESTORE_RULES_SCHEMA_VERSION=1` for Android or iOS. An absent, malformed,
or older value keeps remote writes disabled while local Journal capture remains
available. If rules change incompatibly, increment the required schema version,
deploy and verify the rules first, and update the build value last.
