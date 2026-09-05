# Shared web frontend

The web target renders the same Product and domain modules used by iOS and
Android. Browser-specific adapters provide authentication, storage, Firebase
sync, Nightscout access, and the responsive host.

## Commands

```bash
yarn web
yarn verify:web
yarn build:web
yarn preview:web
```

`yarn build:web` writes the deployable site to `releases/web/`. Its verified
service worker precaches the application shell for offline startup.

## Capability boundary

| Capability                                               | Web status                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Responsive Hub and Back/Hub/Forward navigation           | Available                                                                                                      |
| Hebrew, English, RTL, phone, tablet, and desktop layouts | Available                                                                                                      |
| Google sign-in through Firebase REST Auth                | Available                                                                                                      |
| Personalisation and device-specific layouts              | IndexedDB local-first plus Firestore sync                                                                      |
| Meals and Activity Journal                               | IndexedDB local-first plus Firestore sync                                                                      |
| Meal images                                              | IndexedDB Blob-first, scoped Firebase Storage upload and durable deletion retry                                |
| Nightscout charts and summaries                          | Encrypted backend vault and stateless proxy                                                                    |
| Nightscout cache                                         | Source-isolated, 14-day hot cache, 25 MB Workspace budget                                                      |
| Hypo investigation                                       | Available through the shared Trends glucose source                                                             |
| Similar Events                                           | Available through bounded, cancellable Nightscout history reads                                                |
| Loop changes and impact                                  | Available for factual Nightscout profile-switch events; an empty state is shown when the source has no history |
| AI chat and specialists                                  | Authenticated ShaniDms LLM proxy                                                                               |
| Alert rules and Update Center                            | IndexedDB local-first plus scoped Firestore sync when signed in                                                |
| Background browser push notifications                    | Not implemented in V1                                                                                          |

Nightscout-dependent destinations remain discoverable but disabled until a
Nightscout connection exists. Loop profile switches are marked as observed
facts. The browser does not invent old or new therapy-setting values when
Nightscout does not expose them.

## Security and storage

- The browser never receives a saved Nightscout or LLM credential after it is
  provisioned.
- API calls carry a Firebase ID token to `shaniApi`.
- The server returns an opaque Nightscout Source ID, not its URL.
- Raw Nightscout history is cached only on the client and is not persisted by
  the ShaniDms backend.
- Journal and Personalisation remote documents remain scoped to the signed-in
  Product User and Workspace.
- Meal-image local IDs and Firebase Storage object paths are checked against
  both the Product User and Workspace before upload, download, or deletion.

## Runtime configuration

The browser reads these Vite variables at build time. For one artifact across
multiple environments, edit `runtime-config.js` next to `index.html` after the
build. It sets the same values on `globalThis.__SHANI_WEB_CONFIG__` before the
app starts. The service worker fetches this public file from the network first
and keeps only its last successful version for offline startup. An operator can
replace it without rebuilding; online clients receive the replacement before
the offline fallback is used.

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET        # optional; defaults to <project>.appspot.com
VITE_GOOGLE_WEB_CLIENT_ID
VITE_SHANI_API_BASE_URL             # optional when the default Firebase region is used
```

These are public Firebase Web and OAuth identifiers. Never put a Nightscout
API key, LLM key, Firebase service-account credential, or user token in the
file. Those secrets belong behind the authenticated backend vault/proxy.

The main Product experience is loaded as a separate browser chunk after the
small offline-first shell opens. This keeps the initial route smaller without
changing the React Native bundle.

The static artifact supports domain-root and sub-path hosting because Vite uses
relative assets and the service worker resolves its cache from its own scope.
