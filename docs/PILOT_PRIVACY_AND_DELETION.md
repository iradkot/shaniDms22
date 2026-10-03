# Pilot privacy and account deletion

The pilot policy is version `2026-10-03.1`. Editable operator defaults are Irad
and `irad16@gmail.com` in `src/modules/privacy/privacy.ts`. Hebrew and English
copies describe Google/Firebase, the server-decryptable credential vault,
Nightscout proxying on web, OpenAI context and image transfers, local AI memory,
retention, withdrawal, and the limits of provider/backups deletion. This is the
pilot implementation policy; review the operator details and publish its public
URL before store distribution. This document describes the implementation and
deployment requirements; a source change alone does not establish a live rollout.

## Consent

Missing or obsolete consent denies cloud and AI transmission. The product asks
for two unchecked affirmative choices; AI cannot imply cloud consent. A local
choice keeps native Nightscout viewing/local records and existing browser local
Journal data available. Browser Nightscout access requires the cloud proxy.
Google sign-in shares identity with Firebase, so the policy is readable before
sign-in. Notification permissions, FCM auto-init/token registration, native cloud
gateways, backend proxying, and all AI health requests follow cloud/AI consent.

Opening Privacy stops the product runtimes. Withdrawal is blocked locally before
the server request. A failed withdrawal leaves a durable pending marker; retry
must contact the server even after the old cached choice was removed. Closing
the view cannot restore the previous permission. Authentication/session changes
invalidate pending token requests and responses.

The server checks consent before the upstream call and before returning an AI
result. Firestore/Storage rules independently require the exact policy and cloud
choice, and deny owner access after the private deletion lock exists. Vault
writes read the lock and consent in the same Firestore transaction as the write,
so slow credential validation cannot recreate deleted credentials.

## Deletion

The UI requires a second, permanent-deletion confirmation. Recent Google sign-in
(within 10 minutes) is required to issue the deletion receipt and initiate the
operation. A random 256-bit receipt is bound to the owner on the server and saved
on the device before destructive work starts. The owner request authorizes it
and locks the account before deletion. The narrowly scoped unauthenticated
`/v1/account/delete/finish` route can only resume that already authorized
operation. It returns no account identity, credentials, or health data. It cannot
start deletion with an unissued/unapproved receipt. An unused expired receipt
can be replaced only by fresh authenticated sign-in to the same owner.

The server removes:

- The complete `users/{uid}` Firestore document tree, including all Workspaces,
  Journal operations/trash, preferences, alerts, and legacy owner collections.
- The complete `privateCredentialVault/{uid}` tree.
- Storage objects strictly under `users/{uid}/`.
- Owner-stamped records in legacy shared food/activity/notification collections.
- Firebase Auth identity, after the data and images succeed.

Partial failures retain the lock and receipt for retry. A lost response after
Auth deletion does not require recreating the deleted account: the persisted
receipt can finish the same job. Minimal private deletion state (owner UID,
receipt hash, timestamps/completion) remains to deny stale writes and recover the
operation; it contains no health data or credentials.

The native client persists source identities before profile purge, blocks and
drains profile/cache/image mutations, removes owner caches, secure credentials,
Journal/settings/AI memory and tracked local image files, then clears Firebase
persistence. New image copies are owner-indexed before the copy, so failed
Journal writes and interrupted captures can be cleaned. The browser removes its
owner blob prefix including orphans, blocks new owner blob writes, clears owner
IndexedDB records, and signs out. Success is not reported until both server and
local steps finish. A different active native account blocks the global cache
wipe until sign-out; its data is not silently erased.

The additional merge review added exact owner stamps/unambiguous workspace
scopes for recommendation memory and browser history/alert stores. Legacy
hyphenated scopes are removed only when retained workspace metadata proves a
single owner. Local Journal, AI, alert, and preference writes register with an
owner barrier; deletion blocks new writes and waits for already-started writes
before purging, including parallel writes that fail independently.

Android deletion also explicitly awaits background teardown before the cloud
request and during startup recovery. It persists a deleted-owner fence, removes
that owner's native credential and widget health state, and cancels scheduled
and active sync. Failures remain visible for retry. An explicit stored owner is
required to enable/read background sync. Historical native configuration with
no owner stamp is disabled until the signed-in provider writes a verified
owner; its unassignable credential/widget data is preserved. A matching server
URL alone never permits deletion of another account's data.

Old unscoped files/caches whose owner cannot be proved are preserved. The policy
explains this and the optional device/site storage reset, which clears every
account's local copies. Other offline devices and third-party logs/backups may
retain prior copies. Nightscout, the user's Google account, and sensor/pump
records are not deleted. Device tests must still verify deletion recovery and
Firebase persistence cleanup with a disposable account.

Anonymous receipt recovery has a shared instance request budget before receipt
lookup. The limiter bounds retained active identities and reclaims only expired
budgets. Provider/edge throttling still needs deployment verification.

## Deployment prerequisites (pending)

Deploy and verify the backend, `firestore.rules`, and `storage.rules` together
before enabling sync. Keep native `FIRESTORE_RULES_SCHEMA_VERSION` absent/0 for
an unverified preview. Only a verified deployment permits value **2** on Android,
iOS, and browser public `firestoreRulesSchemaVersion` (or
`VITE_FIRESTORE_RULES_SCHEMA_VERSION`). Schema 1 is insufficient; browser journal,
personalization, alert and image remotes remain disabled until 2 is configured.

Storage rules read the Firestore consent and deletion-lock documents. Verify
cross-service rules access is enabled for the project's Firebase Storage service
agent during the reviewed rules deployment. The agent
`service-77401553924@gcp-sa-firebasestorage.iam.gserviceaccount.com` needs
`roles/firebaserules.firestoreServiceAgent` on `shanidms-3a065` for these
cross-service reads. Test both emulators together:
`yarn test:rules:storage` starts Firestore and Storage, then checks missing/old
consent, withdrawal, deleted-owner denial, immutability, and cross-owner denial.
`yarn test:rules:firestore` covers the equivalent Journal privacy cases.

Read-only inspection on 2026-10-03 found deployed `shaniApi` uses
`shani-api-runtime@shanidms-3a065.iam.gserviceaccount.com`. Its current project
custom role grants `datastore.entities.create/delete/get/update` and
`firebaseauth.users.get`. Before deploying deletion, review/add these exact
permissions to the runtime service account at the narrow appropriate scope:

- `firebaseauth.users.delete` for the final Auth removal.
- `datastore.entities.list` for recursive subcollection discovery and legacy
  owner queries.
- `datastore.databases.get` for Firestore transaction begin/rollback, including
  consent updates and credential writes.
- `storage.objects.list` and `storage.objects.delete` on the application's
  configured image bucket. Read-only bucket IAM inspection also found no direct
  runtime-service-account grant on `gs://shanidms-3a065.appspot.com`; this access
  must be reviewed and added before the deletion endpoint can run.

Configure the backend's `STORAGE_BUCKET_NAME` as the bare existing bucket name
`shanidms-3a065.appspot.com`. An absent value uses Firebase's configured default,
which must not be assumed to exist in a direct gcloud deployment.

Preserve the existing KMS envelope encryption/decryption access. Do not blindly
grant broad Firebase Admin or Storage Admin roles. Apply the reviewed
[`infrastructure/privacy/deploy.ps1`](https://github.com/iradkot/shani-dms-firebase/blob/main/infrastructure/privacy/deploy.ps1)
entrypoint from the infrastructure repository with the exact reviewed app commit.
See [Backend deployment](BACKEND_DEPLOYMENT.md#deploy-privacy-infrastructure-and-backend-from-powershell)
for the command. Verify least-privilege permissions and receipt retry with a
disposable account before release. Record live results separately; the dated
inspection above describes the state before that rollout.

References: [Firestore transaction IAM permissions](https://firebase.google.com/docs/firestore/security/iam)
and [deploying cross-service Firebase rules](https://firebase.google.com/docs/rules/manage-deploy).

## Verification

Focused tests cover default denial, versioning, independent choices, concrete
deletion confirmation, delayed-token/owner races, pending withdrawal restart and
retry, same-owner expired receipt renewal, signed-out completion, recursive
deletion ordering, partial failures, delayed vault writes, and owner-specific
local/image/cache cleanup. Automated checks do not establish legal compliance,
provider erasure, or that physical-device deletion has been exercised.
