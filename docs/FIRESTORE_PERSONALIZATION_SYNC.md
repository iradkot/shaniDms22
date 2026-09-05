# Product Personalization Firebase sync

Product Personalization is local-first. The UI reads and updates local storage
immediately. A durable, coalescing outbox retries every 30 seconds while the
Product Experience is mounted and after every save. At most one full snapshot
is pending for each of five sync sections.

## Sync boundaries

- Account Favorites and hidden Modules sync at
  `users/{firebaseUid}/productPersonalization/account`.
- Workspace relationship and questionnaire progress sync at
  `users/{firebaseUid}/workspaces/{workspaceId}/productPersonalization/current`.
- Phone, Tablet, and Desktop Layout Profiles sync as independent documents at
  `users/{firebaseUid}/productPersonalization/layout_{formFactor}`.
- Device Recent Modules remain only in the local device key. They are never
  represented in a remote mutation or document.

Layout Profiles may include an optional `dayGraph` object with `schemaVersion: 1`,
`mode: 'separate' | 'mixed'`, and `windowHours: 'full-day' | 3 | 6 | 12`.
Existing profiles without it remain valid. Only the explicit **Remember this
view** action writes it; selected dates, cursor positions, and event focus remain
transient. Chart saves use an updater against the latest local snapshot, so they
cannot replace concurrent Favorites or Recent Modules. Native rotation keeps
the same form-factor profile; Web uses the browser width.

The Workspace and Nightscout source identifiers are derived opaque IDs. No
Nightscout URL, API key, LLM key, glucose value, date filter, or other medical
context is accepted by the strict remote codecs. Firestore rules are
owner-only, allowlist every top-level payload field, reject deletes, and keep a
default-deny catch-all.

## Conflict policy

Each local save carries an integer `savedAt` and opaque `mutationId`. The later
save wins; equal timestamps are broken by lexicographic mutation ID. A remote
pull never replaces a section with a pending local mutation. The transaction
returns the deterministic winner and advances its remote revision by exactly
one. Layout documents are independent, so a phone edit cannot overwrite a
concurrent tablet or desktop edit.

This is a presentation-preference policy only. It must not be reused for
clinical facts or credentials.

## Verification and production deploy gate

Run all authenticated rule suites with:

`yarn verify:rules`

Native adapters require `FIRESTORE_RULES_SCHEMA_VERSION=1` in the signed build.
The default is zero and therefore fail-closed. Deploy the checked-in rules to
the intended Firebase project before enabling that build value. A build never
silently relaxes or deploys production rules.
