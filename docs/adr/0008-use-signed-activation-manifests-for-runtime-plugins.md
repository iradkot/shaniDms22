# Use signed activation manifests for runtime plugins

ShaniDms will support runtime extension through a typed Product Destination Registry and signed, versioned first-party manifests. In V1 a manifest may activate or configure an approved implementation but may not deliver arbitrary executable code: iOS implementations ship in the reviewed app build, Android implementations ship in the base bundle or Play Feature Delivery, and web implementations come from the controlled first-party deployment. This preserves runtime installation and rollout while respecting store policy and keeping health-data execution reviewable.

## Considered Options

- A build-time-only registry was rejected because runtime rollout, disablement, and extension are explicit product requirements.
- A universal downloaded JavaScript, Wasm, or native plugin format was rejected because it conflicts with native-store rules and would create an unsafe cross-platform trust model.
- A third-party marketplace under Apple's plugin-host rules was deferred because it adds publisher review, content moderation, consent, privacy, and clinical-governance obligations beyond V1.

## Consequences

Every manifest is schema-validated, signed, compatibility-checked, permission-scoped, staged atomically, auditable, revocable, and recoverable through a last-known-good version. Installation intent follows the account while each device resolves the appropriate platform implementation. A Capability Broker grants values—not credentials or storage handles—per Product User, Workspace, plugin, publisher, version, and named capability; writes and reminders remain host-controlled and require the normal confirmations, and therapy-setting writes are never available. The Registry is not a security sandbox. Third-party execution remains outside V1; a future experiment would begin on the web in a separate-origin sandbox.

## Implemented V1 interface

The executable seam is `RuntimePluginManager`. It accepts an untrusted activation manifest, a Product User and Workspace scope, and the current host environment. It returns only an activated, disabled, grant-required, or quarantined result. Callers do not perform signature, version, rollout, staging, health, recovery, or downgrade checks themselves.

The implementation now enforces these invariants:

- strict 32 KiB manifest decoding with unknown-field rejection;
- canonical JSON and payload SHA-256 verification;
- dependency-free ES256 verification against publisher-bound keys shipped by the host;
- exact host, app, platform, Extension Point, implementation, health-risk, and capability compatibility;
- deterministic signed rollout cohorts, expiry, version and key revocation, and downgrade prevention;
- versioned grants scoped to one Product User, Workspace, publisher, plugin, and major version;
- a whole-scope local write-ahead record, staged health check, atomic activation, quarantine, recovery, and an explicit last-known-good rollback;
- cached-manifest re-verification before it is exposed after restart; and
- a typed Capability Broker that currently exposes only bounded glucose summaries and allowlisted destination opening. It never exposes credentials, SDK objects, raw storage, network access, or therapy writes.

The initial `shani.first-party.agp-guide` implementation is static React Native code already present in the reviewed app build. A verified manifest can add its child destination to the Trends Extension Point. Its view renders fixed typed copy and cannot interpret remote HTML, Markdown, JavaScript, or expressions.

Production signing keys remain outside the repository. Release infrastructure must sign the canonical envelope with P-256, encode the signature as fixed-width `R || S` base64url with low-S normalization, publish the manifest and revocation metadata over TLS, and rotate the corresponding public key through a reviewed app release. See `docs/RUNTIME_PLUGINS.md` for the host wiring and signing contract.
