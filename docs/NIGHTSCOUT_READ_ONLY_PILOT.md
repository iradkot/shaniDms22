# Nightscout access for the pilot

Updated 2026-10-19: native and browser connections accept a Nightscout subject token or API_SECRET in one credential field. Subject tokens can have read, write or admin permissions. The app chooses the authentication format automatically. A pasted `token=` prefix is accepted; API_SECRET is hashed with SHA1, and an existing 40-character SHA1 value is preserved. Enter the site address with or without `https://`; a missing scheme defaults to HTTPS. Credentials belong in the separate credential field, not the URL.

Connection verification reads actual sensor glucose entries using the supplied credential. It no longer depends on the authorization endpoint or rejects credentials for having extra permissions. A public status endpoint alone cannot establish success. Save checks the connection automatically; the separate test button is optional.

The persistent token is never hashed. Native and Android background/widget GET requests send it unchanged in the `api-secret` header. API_SECRET connections send the SHA1 value in that header. The old browser compatibility adapter uses the `token` or `secret` query parameter. The rebuilt browser uses ShaniDms' authenticated stateless proxy and receives no vaulted credential. The backend pins a public DNS answer, denies redirects, and checks glucose access before vault provisioning.

Device credentials remain in the account-scoped Keychain/Keystore store; only the credential kind is added to ordinary profile metadata. The Android bridge retains its existing encrypted Keystore format. Vault credentials remain encrypted with account-bound authenticated encryption. Existing API_SECRET profiles retain their IDs, Workspaces and data without a forced reconnect. New and existing API_SECRET profiles can use the server vault. Editing a connection with the credential field blank retains its saved credential.

Authentication failures are reported without an anonymous-read fallback. A missing secure device credential disables source/background configuration. Changing accounts clears configured headers/query parameters and disables the previous background source. Connection verification is repeated when a connection is tested, added, edited or provisioned. ShaniDms continues to issue GET requests only, even if the supplied credential permits writes. No site roles, secrets, or external configuration are changed.

Verified against the official Nightscout source on 2026-10-03:

- [Authorization endpoint and permission response](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/authorization/endpoints.js)
- [Raw subject-token header support and effective default roles](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/authorization/index.js)
- [Built-in readable role and subject-token format](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/authorization/storage.js)
- [API v1 authentication schemes](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/server/swagger.yaml)

Automated tests cover raw-token transport, API_SECRET onboarding and editing, URLs with and without a scheme, secure account separation and restart, browser proxy provisioning, Android bridge compatibility, rejected credentials, safe errors, and saved-profile preservation. Physical device checks remain separate from automated verification.

Account deletion records opaque cache-source identities before removing connection metadata. Owner-scoped source and credential-service indexes retain attribution for removed profiles and interrupted saves. Deletion drains in-flight credential and cache writes, blocks later writes from old async operations, and removes only that owner's indexed connections and caches. Historical opaque caches left by profiles removed before these indexes existed cannot be safely attributed to an account. Range caches are pruned under their 14-day policy during cache operations; old Oracle caches have no guaranteed automatic expiry. This implementation does not claim complete deletion of unassignable pre-upgrade local remnants.
