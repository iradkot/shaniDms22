# ADR 0016: Scope Firebase data by owner and Workspace

- Status: Accepted
- Date: 2026-08-30

## Decision

Store App-Owned synced data below the authenticated Product User and the stable
Workspace identity:

`users/{firebaseUid}/workspaces/{workspaceId}/...`

Journal entries, tombstones, Account Personalisation, Workspace
Personalisation, and Layout Profiles use typed versioned documents below this
path. Device-local Recents are never uploaded. Replaceable Nightscout cache
values and raw Nightscout history are never written to these documents;
explicit External Event Links keep only the stable source identity, record
identity, role, and app-owned link metadata.

Production writes remain disabled until Firestore and Storage rules verify that
`request.auth.uid` equals the `{firebaseUid}` path segment, reject unknown
fields and invalid sizes where practical, and pass emulator tests for cross-user
denial. The existing root `food_items` and `sport_items` collections are legacy
data sources, not the schema for the rewritten Journal.

## Consequences

- One Firebase account can synchronise the same Workspace across its devices.
- A different Firebase account receives a different owner namespace even when
  it points to the same Nightscout URL.
- Native and web clients can share the same remote contract through separate
  platform Adapters.
- Sync cannot be enabled safely by adding a Firestore client call alone; rules,
  rule tests, runtime codecs, and idempotent outbox acknowledgement are part of
  the feature.
