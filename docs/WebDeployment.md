# Public web deployment

The shared native/web product, including AI recommendations, is hosted at:

- https://shanidms-3a065.web.app
- https://shanidms-3a065.firebaseapp.com

Firebase project: `shanidms-3a065`. Hosting site: `shanidms-3a065`.
Firebase Web app: `ShaniDms Web` (`1:77401553924:web:349b67b5d42a8c6fc38951`).

## Publish an update

From the repository root, with Node.js and an already authenticated Google Cloud CLI:

```powershell
yarn build:web
node scripts/deploy-web.mjs
```

The script explicitly targets this project, independently of the CLI's default
project. It gets a short-lived access token in memory, retrieves the registered
Firebase app's public configuration, writes `releases/web/runtime-config.js`,
and publishes only the static build through the Firebase Hosting REST API.
It excludes source maps and hidden files. It does not deploy database rules,
functions, or other projects. Never put patient data or server secrets into
runtime configuration or the static build directory.

Hosting configuration is in `firebase.json`. Hashed assets are cached;
HTML and service workers revalidate. Runtime configuration uses `no-store`.
The HTML referrer policy sends only the site origin to other HTTPS hosts. Google
Sign-In needs this origin to validate its button; `no-referrer` prevents it from
working even when the origin is authorized.

## Existing backend and sign-in

The production API is
`https://us-central1-shanidms-3a065.cloudfunctions.net/shaniApi`.
Its `ALLOWED_CORS_ORIGINS` includes both exact HTTPS origins above. The API still
requires Firebase authentication; permitting the website origin does not bypass
authentication. Preserve other environment variables when updating it.

Both hosts must be listed in Firebase Authentication's authorized domains and
in the existing Google OAuth web client's authorized JavaScript origins.
The Google web client is read from `android/app/google-services.json`; no OAuth
client secret belongs in the browser. Google origin changes may take time to
propagate. Manage those settings separately; the deploy script does not change
authentication or backend configuration.

## Verify

Open the live URL and check browser console errors, the Google sign-in button,
the product shell, and the recommendations screen. A successful static upload
alone does not verify authentication or a live AI recommendation. Check that
allowed-origin preflight requests return 204, anonymous API requests return 401,
and requests from unrelated origins remain blocked.

References: [Hosting REST deployment](https://firebase.google.com/docs/hosting/api-deploy),
[Google Sign-In client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
