# Credential rotation and Git history cleanup

The current tree removes and ignores credential files. Git history still
contains credential-shaped filenames, so deleting the working files is not
sufficient.

## Current review inventory (2026-10-03)

`yarn security:exposure-audit` inspects all local history refs in memory and
prints file paths and field names only. It never prints secret values. The
current findings are Google OAuth client secrets (`client_secret` /
`CLIENT_SECRET`) and Apple Fastlane account/application-specific passwords.
The old `.env` contains a public Firebase web API identifier; its presence alone
does not establish a secret leak or require rotation. This inventory is not a
complete content scan, and no provider-side rotation has been verified.

The merge review also found sensitive Apple CI material stored as repository
Actions **Variables**, which are not an encrypted secret store:
`APP_STORE_CONNECT_PRIVATE_KEY`, `APPLE_CERTIFICATE_P12`,
`APPLE_CERTIFICATE_PASSWORD`, and `CI_KEYCHAIN_PASSWORD`. A metadata inspection
accidentally printed their values to the local review transcript. Treat these
values as exposed too. Replace/revoke the App Store Connect key, review and
replace the signing certificate/private key as appropriate, change the affected
passwords, and update dependent encrypted GitHub Secrets before removing the
obsolete Variables. Do not put replacement values in Variables or review logs.
This review did not rotate credentials or alter GitHub configuration.

Do not invalidate an active OAuth client or Apple credentials blindly. Confirm
which deployment/CI still uses them, replace dependent configuration, test the
replacement, and then revoke the exposed value at its provider. Provider account
actions and shared-history rewriting remain outstanding. Neither a new APK nor
the filename scanner proves those actions happened.

Production Android wrapper builds and signed iOS Fastlane builds now run the
history gate. Production Android CI also checks it before decoding a signing
key. Internal restricted pilot previews can be built while that work remains.

## Required order

1. Rotate every affected Google OAuth, Firebase/service, Apple/Fastlane, LLM,
   Nightscout, signing, and other secret that was stored in those files.
2. Move replacement values to GitHub encrypted Secrets or the approved managed
   secret store.
3. Confirm the app and CI work only with the replacements.
4. Coordinate a maintenance window with every collaborator.
5. Rewrite all branches and tags with `git filter-repo` using an explicit list
   of the affected paths.
6. Force-push only after review, invalidate old clones, and have collaborators
   re-clone instead of merging the old history.
7. Run:

   ```sh
   yarn security:tracked-credentials
   yarn security:credential-history
   ```

History rewriting is destructive and affects every clone. It is intentionally
not automated by the application build and must happen only after rotation and
explicit coordination.
