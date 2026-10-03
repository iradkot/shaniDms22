# Backend deployment

`shaniApi` is an authenticated Firebase HTTPS Function. It validates and stores
Nightscout and LLM credentials in an encrypted Firestore vault, proxies Web
Nightscout reads without persisting history, and sends AI requests without
returning provider credentials to clients.

## Verification

```sh
yarn verify:functions
yarn verify:rules
```

## Required configuration

For an existing deployment, reuse its KMS key so stored credentials remain
readable. A new environment needs an AES-capable Cloud KMS key. Grant the
Functions runtime service account only the KMS encrypt/decrypt permissions it
needs. Configure:

```text
KMS_KEY_NAME=projects/PROJECT/locations/LOCATION/keyRings/RING/cryptoKeys/KEY
ALLOWED_LLM_MODELS=gpt-5.5
ALLOWED_CORS_ORIGINS=https://app.example.com
STORAGE_BUCKET_NAME=EXISTING_BUCKET_NAME
```

Use the real reviewed model allowlist and every exact production Web origin.
Do not use wildcard CORS. Do not put these values in a committed `.env` file.

The privacy deployment explicitly selects the existing image bucket with
`STORAGE_BUCKET_NAME=shanidms-3a065.appspot.com`. Supply only its bare name,
without `gs://` or an object path. If the setting is absent or blank, the backend
uses Firebase's configured default bucket. A gcloud deployment may not supply
that default, so the infrastructure entrypoint always sets the explicit name.

## Deploy order

1. Run all verification commands.
2. Review the runtime service account's permissions for consent/account deletion
   and verify Firebase Storage's cross-service access to Firestore rules
   documents. Follow the exact additions in
   [Pilot privacy and deletion](PILOT_PRIVACY_AND_DELETION.md#deployment-prerequisites-pending),
   preserving existing KMS access.
3. Deploy schema **2** `firestore.rules` and `storage.rules` to the intended
   project, together with the consent/deletion backend change.
4. Deploy `shaniApi` with the KMS and environment configuration. Verify Auth,
   vault provision/status/remove, one bounded Nightscout range, one AI request,
   consent denial/withdrawal, cross-user denial, and account-deletion recovery
   using a disposable staging account.
5. Only after that deployment is verified, set
   `FIRESTORE_RULES_SCHEMA_VERSION=2` in signed native builds and browser
   `firestoreRulesSchemaVersion`/`VITE_FIRESTORE_RULES_SCHEMA_VERSION=2`.
   Keep absent/0 for an unverified preview; schema 1 is insufficient for the
   pilot privacy controls.
6. Publish the Web artifact and verify its exact origin is allowlisted.

The client defaults are fail-closed. Building an app does not deploy backend
rules or grant KMS access.

## Deploy privacy infrastructure and backend from PowerShell

Use PowerShell 7+, Node.js 22+, installed `functions` npm dependencies and an
authenticated Google Cloud CLI. The selected project must already have billing,
Firebase Authentication and a default Firestore database. The deployer needs
permission to update custom roles and bind IAM roles, deploy Firebase rules and
Cloud Functions/Cloud Run, and act as the runtime
service account. The project's build account also needs its normal Cloud Build,
Artifact Registry and source-bucket permissions. The script does not grant
Owner/Editor or change existing build-account permissions.

Use the reviewed deployment entrypoint in
[`iradkot/shani-dms-firebase`](https://github.com/iradkot/shani-dms-firebase/blob/main/infrastructure/privacy/deploy.ps1).
Run it from that repository and pin the clean app checkout to its reviewed commit:

Review the exact operations without changing cloud resources:

```powershell
pwsh -File infrastructure/privacy/deploy.ps1 `
  -AppSourcePath C:\Users\irad1\projects\shaniDms22 `
  -ExpectedAppGitSha REVIEWED_APP_COMMIT `
  -WhatIf
```

For the authorized rollout, run the same command without `-WhatIf`. Keep the
existing runtime identity and KMS key. Preserve the deployed model allowlist,
CORS origins, and unrelated environment settings. The explicit image bucket
must be the same bucket used by clients and covered by `storage.rules`.

The privacy additions require `firebaseauth.users.delete`,
`datastore.entities.list`, `datastore.databases.get`, and bucket-scoped
`storage.objects.list`/`storage.objects.delete`, plus the Storage cross-service
rules grant described in
[Pilot privacy and deletion](PILOT_PRIVACY_AND_DELETION.md#deployment-prerequisites-pending).
`datastore.databases.get` is needed for Firestore transactions, including consent
updates and credential writes. Firestore server IAM applies at the
database/project boundary; user isolation remains enforced by the API's verified
UID and document paths.

Deploy only `shaniApi`, `firestore.rules`, and `storage.rules` for this rollout.
An unauthenticated `401` proves authentication is enforced; it does not establish
that a privacy route exists or that its IAM permissions work. Use a disposable
account to verify consent saving, withdrawal, cross-user denial, and completed
deletion with receipt retry before enabling schema 2 clients.

The older app-repository `scripts/deploy-ai-backend.ps1` is an AI-only deployment
script. It has the earlier runtime permission list, omits the privacy rules and
bucket permissions, and replaces environment settings with its own model/CORS
values. Do not use it for this privacy rollout.

References: [gcloud functions deploy](https://docs.cloud.google.com/sdk/gcloud/reference/functions/deploy),
[Node.js buildpacks](https://docs.cloud.google.com/docs/buildpacks/nodejs), and
[Firestore server IAM](https://firebase.google.com/docs/firestore/security/iam).

## Existing production vault access rules

The production Firestore release inspected on 2026-09-07 still used a legacy
blanket authenticated read/write grant. The narrow AI rollout guard changes that
grant to capture the first collection and require
`collection != 'privateCredentialVault'`. Adding a separate deny rule under a
blanket allow would not protect the vault, because any matching allow wins.
Other legacy production access remains unchanged. The repository's complete
`firestore.rules` migration is a separate deployment.

`scripts/harden-vault-rules.mjs` reads the current deployed source, accepts only
the exact reviewed legacy source or its already hardened counterpart, and
refuses unknown rules. Provide `SHANI_RULES_PROJECT` and a transient
`SHANI_RULES_OAUTH_TOKEN` through the process environment. It reviews by default;
`--apply` creates a new ruleset and switches only `cloud.firestore`, after
checking that the active release did not change during the operation. Tokens
and raw error responses are not printed. Do not put tokens in command arguments,
source files or logs.

The focused transformation tests run with
`node --test scripts/__tests__/harden-vault-rules.test.mjs`. The corresponding
`harden-vault-rules.emulator.test.mjs` runs inside the Firestore emulator and
checks own/cross-user vault denials plus preserved legacy document access.
Before storing a real AI key, verify that a signed-in client receives
`PERMISSION_DENIED` for direct reads and writes to the disposable test vault.

## AI connection diagnostics

`POST /v1/vault/llm/test` requires the normal Firebase bearer token and an exact
body of `{ "version": 1, "provider": "openai", "model": "APP_MODEL" }`. The model
must be in `ALLOWED_LLM_MODELS`. The server reads only that user's vaulted key.
Success returns `{ "version": 1, "provider": "openai", "model": "APP_MODEL",
"connected": true }`.

The check makes one Responses request with a fixed neutral prompt, a 16-token
output cap, and `store: false`. It sends no health data and does not retry.
It confirms Responses access for the chosen model at that time; it can consume
a small amount of API credit. A response stopped solely by the token cap also
confirms access because the cap includes reasoning tokens. Completed Responses
are accepted; queued, failed, filtered or malformed responses are not.

Vault `configured: true` means the credential is stored. The existing
`/v1/vault/llm/validate` and provision preflight use `/v1/models`; model-list access
does not establish Responses permission, model access or available credit. Use
the explicit connection check after provision or when diagnosing a saved key.

Chat, image analysis and the connection check share safe error codes:

| Code | Meaning |
| --- | --- |
| `unauthenticated` | The app session needs authentication. |
| `credential_missing` | This account has no vaulted AI key. |
| `invalid_credential` | OpenAI rejected the key. |
| `provider_permission_denied` | The key or project cannot make this request. |
| `provider_model_unavailable` | The selected model is unavailable to this project. |
| `provider_quota_exceeded` | API credits, spend limit or usage limit needs attention. |
| `rate_limited` | Temporary request throttling. |
| `upstream_unavailable` | Provider or network outage. |
| `upstream_timeout` | Provider request timed out. |

Provider error text, credentials and health context are never included in these
errors. A failed connection check does not delete or replace the saved key.

References: [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
and [OpenAI error codes](https://developers.openai.com/api/docs/guides/error-codes).
