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

Create an AES-capable Cloud KMS key in the same controlled Google Cloud
environment. Grant the Functions runtime service account only the KMS
encrypt/decrypt permissions it needs. Configure:

```text
KMS_KEY_NAME=projects/PROJECT/locations/LOCATION/keyRings/RING/cryptoKeys/KEY
ALLOWED_LLM_MODELS=gpt-5.5
ALLOWED_CORS_ORIGINS=https://app.example.com
```

Use the real reviewed model allowlist and every exact production Web origin.
Do not use wildcard CORS. Do not put these values in a committed `.env` file.

## Deploy order

1. Run all verification commands.
2. Deploy `firestore.rules` and `storage.rules` to the intended project.
3. Deploy `shaniApi` with the KMS and environment configuration.
4. Verify Auth, vault provision/status/remove, one bounded Nightscout range,
   one AI request, and cross-user denial in staging.
5. Set `FIRESTORE_RULES_SCHEMA_VERSION=1` in signed native builds.
6. Publish the Web artifact and verify its exact origin is allowlisted.

The client defaults are fail-closed. Building an app does not deploy backend
rules or grant KMS access.

## Deploy only the AI backend from PowerShell

Use PowerShell 7+, Node.js 22+, installed `functions` npm dependencies and an
authenticated Google Cloud CLI. The selected project must already have billing,
Firebase Authentication and a default Firestore database. The deployer needs
permission to enable APIs, create service accounts/custom roles, bind IAM roles,
create KMS resources, deploy Cloud Functions/Cloud Run and act as the runtime
service account. The project's build account also needs its normal Cloud Build,
Artifact Registry and source-bucket permissions. The script does not grant
Owner/Editor or change existing build-account permissions.

Review the exact operations without changing cloud resources:

```powershell
pwsh -File scripts/deploy-ai-backend.ps1 -ProjectId shanidms-3a065 -WhatIf
```

After approval, run the same command without `-WhatIf`. Supply
`-AllowedCorsOrigins 'https://actual-app.example'` for a web client. The default
empty CORS list supports native requests with no browser Origin header.

The script enables missing required service APIs, creates a dedicated runtime
service account, and binds a custom role containing only
`firebaseauth.users.get` and Firestore entity get/create/update/delete. These
permissions support revoked-token checks and vault document operations. It
grants KMS encrypt/decrypt only on the new vault key. Firestore server IAM applies
at the database/project boundary; user isolation remains enforced by the API's
verified uid and vault document path. Existing custom roles with different
permissions cause the script to stop for review.

It runs backend verification and calls `gcloud functions deploy shaniApi`
directly. No Firebase-wide deployment, rules deployment, function deletion or
unrelated function update occurs. It sets the app model to `gpt-5.5` and mirrors
the function's memory, timeout and concurrency options explicitly. The exported
Firebase `onRequest` handler is an HTTP request handler usable as the gcloud
entry point; the Google Node.js buildpack compiles `lib/index.js` via
`GOOGLE_NODE_RUN_SCRIPTS=build`. `.gcloudignore` excludes local credentials,
dependencies and generated files from the source upload.

After deployment, the script prints the Cloud Functions endpoint and Cloud Run
URL. It checks the unauthenticated vault-status route for the exact
`401 / unauthenticated` response, without any API key or health data. This checks
deployment/routing/auth enforcement; a signed-in save and explicit connection
test are still needed to check Firestore, KMS and the provider end to end. API
enablement, KMS resources and function execution can incur cloud charges.

The script has no rollback deletion step. Rerunning it reuses its named resources
and deploys only `shaniApi`; inspect a failed step before retrying. The KMS key
name must remain stable once credentials have been stored.

References: [gcloud functions deploy](https://docs.cloud.google.com/sdk/gcloud/reference/functions/deploy),
[Node.js buildpacks](https://docs.cloud.google.com/docs/buildpacks/nodejs), and
[Firestore server IAM](https://docs.cloud.google.com/firestore/docs/security/iam).

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
