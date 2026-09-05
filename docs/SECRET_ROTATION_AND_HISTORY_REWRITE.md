# Credential rotation and Git history cleanup

The current tree removes and ignores credential files. Git history still
contains credential-shaped filenames, so deleting the working files is not
sufficient.

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
