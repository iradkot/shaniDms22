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
