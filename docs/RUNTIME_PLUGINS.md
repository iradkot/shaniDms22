# Runtime Plugins

Runtime Plugins let ShaniDms activate reviewed first-party features without downloading executable code. A manifest can expose, label, order, or disable an implementation that already exists in the app build. It cannot provide a code URL, JavaScript, Wasm, native code, HTML, or an expression to execute.

## Host wiring

The host creates four pieces:

1. A `RuntimePluginRepository`. `KeyValueRuntimePluginRepository` works with AsyncStorage or browser storage and uses a write-ahead record for whole-scope recovery.
2. A `RuntimePluginManifestVerifier` configured with the reviewed implementation catalogue, publisher-bound public keys, and `Es256RuntimePluginSignatureVerifier`.
3. A `RuntimePluginManager` using that repository and verifier.
4. A `RuntimePluginCapabilityBroker` with a host adapter that returns values or performs an allowlisted navigation action. The adapter never returns credentials or SDK handles.

After startup, call `manager.snapshot(scope, environment)`. It re-verifies cached active manifests and recovers interrupted staging. Pass `snapshot.active` to `createRuntimeProductRegistries`, then pass both returned registries to `ProductExperience`:

```tsx
const registries = createRuntimeProductRegistries(snapshot.active);

<ProductExperience
  destinationRegistry={registries.destinations}
  implementationRegistry={registries.implementations}
  // existing props
/>
```

When `activate` returns `grant-required`, show the Product User the publisher, capability, purpose, retention, Product User, and Workspace. Only after explicit confirmation call `manager.grant` with the branded verified manifest returned by `activate`. Call `activate` again to stage and health-check the version. Revocation through `manager.revoke` takes effect before the next broker call and before the next registry snapshot.

## Signed envelope

The manifest schema is defined in `src/modules/plugins/domain/types.ts` and decoded strictly by `parseRuntimePluginManifest`. The release signer must:

1. Canonicalize the `payload` with lexicographically sorted object keys and compute lowercase SHA-256 hex.
2. Place that digest in `payloadSha256`.
3. Canonicalize the complete envelope without `signature`.
4. Sign those UTF-8 bytes with ECDSA P-256 and SHA-256.
5. Convert the signature to the fixed 64-byte `R || S` form, normalize S to the lower half of the curve order, and encode it as unpadded base64url.

Trusted public keys use the uncompressed P-256 point `0x04 || X || Y`, encoded as unpadded base64url. A key is bound to exactly one `publisherId` and has its own validity window. Private keys must stay in the release KMS/HSM and must never enter this repository, CI logs, Firebase documents, an app bundle, or a plugin manifest.

## Activation and recovery

Activation is serialized per Product User and Workspace:

1. Strictly decode and verify the signed manifest.
2. Check the exact versioned Capability Grant.
3. Persist the manifest as staged.
4. Run the bounded implementation health check.
5. Atomically switch the active pointer and retain the previous healthy version.

A crash during staging is detected on the next operation. The incomplete version is quarantined and the prior active version stays intact. A failed health check also quarantines that exact version, so polling cannot create an endless retry loop. An explicit local rollback re-verifies and health-checks the last-known-good package before switching back.

## Current external requirements

The repository deliberately contains no production private signing key and no unsigned-to-signed production release shortcut. Before enabling remote manifests in a release, deployment must provide:

- a KMS/HSM-backed P-256 signing job;
- reviewed public keys embedded in host configuration;
- a TLS manifest endpoint and signed revocation/kill-switch feed;
- a Product User consent surface for any requested capability; and
- platform rollout monitoring that calls rollback or publishes a signed disable manifest when health degrades.
