# Alert and Update Center Firebase sync

Alert Rules and app-owned Update Center records are offline-first. A local
write and its durable outbox entry complete without waiting for Firestore.
Retries run when the runtime starts, returns online, or becomes visible.

## Remote boundaries

- Mutable Alert Rules live at
  `users/{firebaseUid}/workspaces/{workspaceId}/alertRules/{ruleId}`.
- Immutable occurrences, reminders, and generated updates live in the sibling
  `updateCenterRecords` collection.
- Read receipts live separately in `updateCenterReadState`. Marking an item as
  read never rewrites its factual content.

Every document repeats and validates the authenticated owner and opaque
Workspace ID. Runtime codecs and Firestore rules allowlist every field. They do
not accept Nightscout URLs, API keys, raw Nightscout history, or arbitrary
payloads. An alert occurrence stores only the rule snapshot and observation
needed to explain that occurrence.

## Conflict and immutability policy

Rule changes use a server-assigned revision. The later `changedAtMs` wins;
equal timestamps are broken by the opaque `mutationId`. This gives every
device the same deterministic winner. Deletion is a revisioned tombstone, so a
stale device cannot silently restore a deleted rule.

Update records are create-only. Reusing an ID with different content fails.
Read receipts may only move forward in time.

## Verification and deployment gate

Run the dedicated authenticated Emulator Suite test:

```sh
npx --yes firebase-tools@13.35.1 emulators:exec --only firestore \
  --project shani-alerts-rules-test \
  "node --test scripts/__tests__/firestore-alerts.rules.test.mjs"
```

Deploy the checked-in `firestore.rules` before enabling native remote sync.
Then set `FIRESTORE_RULES_SCHEMA_VERSION=1` in signed Android and iOS builds.
The default value is zero, which leaves local alerts working while remote
writes remain disabled. Web sync also requires an authenticated Firebase user;
signed-out Web sessions remain local-only.
