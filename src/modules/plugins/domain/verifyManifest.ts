import {canonicalJson, sha256Hex} from './canonical';
import {parseRuntimePluginManifest} from './manifestValidation';
import {
  RuntimePluginImplementation,
  RuntimePluginManifest,
  RUNTIME_PLUGIN_PLATFORMS,
  RuntimePluginSignatureVerifier,
  RuntimePluginVerificationEnvironment,
  RuntimePluginVerificationError,
  TrustedRuntimePluginSigningKey,
  VerifiedRuntimePluginManifest,
} from './types';
import {compareVersions, parseVersion} from './version';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_MANIFEST_LIFETIME_MS = 366 * 24 * 60 * 60 * 1000;

export const runtimePluginManifestSigningMessage = (
  manifest: Omit<RuntimePluginManifest, 'signature'>,
): string => canonicalJson(manifest);

const extensionVersionKey = (extensionId: string, version: string): string =>
  `${extensionId}@${version}`;

const selectedForRollout = (
  manifest: RuntimePluginManifest,
  environment: RuntimePluginVerificationEnvironment,
): boolean => {
  const {percentage, salt} = manifest.payload.rollout;
  if (percentage === 100) {
    return true;
  }
  if (percentage === 0) {
    return false;
  }
  const digest = sha256Hex(
    `${manifest.payload.extensionId}\u0000${environment.scope.productUserId}\u0000${environment.scope.workspaceId}\u0000${salt}`,
  );
  const bucket = Number.parseInt(digest.slice(0, 8), 16) % 10_000;
  return bucket < percentage * 100;
};

const fail = (
  code: RuntimePluginVerificationError['code'],
  message: string,
): never => {
  throw new RuntimePluginVerificationError(code, message);
};

export interface RuntimePluginManifestVerifierOptions {
  readonly signatureVerifier: RuntimePluginSignatureVerifier;
  readonly trustedKeys: readonly TrustedRuntimePluginSigningKey[];
  readonly implementations: readonly RuntimePluginImplementation[];
}

export class RuntimePluginManifestVerifier {
  constructor(private readonly options: RuntimePluginManifestVerifierOptions) {
    const duplicateKey = options.trustedKeys.find(
      (key, index) =>
        options.trustedKeys.findIndex(item => item.keyId === key.keyId) !== index,
    );
    if (duplicateKey) {
      throw new Error(`Duplicate Runtime Plugin signing key: ${duplicateKey.keyId}`);
    }
    const duplicateImplementation = options.implementations.find(
      (implementation, index) =>
        options.implementations.findIndex(
          item => item.implementationId === implementation.implementationId,
        ) !== index,
    );
    if (duplicateImplementation) {
      throw new Error(
        `Duplicate Runtime Plugin implementation: ${duplicateImplementation.implementationId}`,
      );
    }
  }

  async verify(
    untrustedManifest: unknown,
    environment: RuntimePluginVerificationEnvironment,
  ): Promise<VerifiedRuntimePluginManifest> {
    if (
      !Number.isSafeInteger(environment.nowMs) ||
      environment.nowMs <= 0 ||
      !Number.isSafeInteger(environment.hostApiVersion) ||
      environment.hostApiVersion <= 0 ||
      environment.scope.productUserId.trim().length === 0 ||
      environment.scope.workspaceId.trim().length === 0 ||
      !RUNTIME_PLUGIN_PLATFORMS.includes(environment.platform) ||
      !parseVersion(environment.appVersion)
    ) {
      return fail(
        'incompatible-host',
        'The Runtime Plugin host environment is invalid.',
      );
    }
    const manifest = parseRuntimePluginManifest(untrustedManifest);
    const {payload} = manifest;

    if (sha256Hex(canonicalJson(payload)) !== manifest.payloadSha256) {
      return fail(
        'payload-hash-mismatch',
        'The plugin payload does not match its signed digest.',
      );
    }

    const signingKey = this.options.trustedKeys.find(
      key =>
        key.keyId === manifest.signingKeyId &&
        key.publisherId === payload.publisherId,
    );
    if (!signingKey) {
      return fail(
        'untrusted-publisher',
        'The plugin publisher or signing key is not trusted.',
      );
    }
    if (environment.revokedSigningKeyIds?.has(signingKey.keyId)) {
      return fail('revoked', 'The plugin signing key has been revoked.');
    }
    const keyStartMs = Date.parse(signingKey.validFrom);
    const keyEndMs = Date.parse(signingKey.validUntil);
    if (
      !Number.isFinite(keyStartMs) ||
      !Number.isFinite(keyEndMs) ||
      environment.nowMs < keyStartMs ||
      environment.nowMs > keyEndMs
    ) {
      return fail('untrusted-publisher', 'The signing key is not currently valid.');
    }

    const signedEnvelope: Omit<RuntimePluginManifest, 'signature'> = {
      schemaVersion: manifest.schemaVersion,
      kind: manifest.kind,
      payload: manifest.payload,
      payloadSha256: manifest.payloadSha256,
      signingKeyId: manifest.signingKeyId,
      signatureAlgorithm: manifest.signatureAlgorithm,
    };
    const signatureIsValid = await this.options.signatureVerifier.verify({
      message: runtimePluginManifestSigningMessage(signedEnvelope),
      signature: manifest.signature,
      key: signingKey,
    });
    if (!signatureIsValid) {
      return fail('invalid-signature', 'The plugin signature is invalid.');
    }

    const issuedAtMs = Date.parse(payload.issuedAt);
    const expiresAtMs = Date.parse(payload.expiresAt);
    if (issuedAtMs > environment.nowMs + MAX_CLOCK_SKEW_MS) {
      return fail('not-yet-valid', 'The plugin manifest is not valid yet.');
    }
    if (expiresAtMs <= environment.nowMs) {
      return fail('expired', 'The plugin manifest has expired.');
    }
    if (
      expiresAtMs <= issuedAtMs ||
      expiresAtMs - issuedAtMs > MAX_MANIFEST_LIFETIME_MS
    ) {
      return fail(
        'invalid-manifest',
        'The plugin manifest has an invalid validity window.',
      );
    }
    if (
      issuedAtMs < keyStartMs - MAX_CLOCK_SKEW_MS ||
      expiresAtMs > keyEndMs
    ) {
      return fail(
        'untrusted-publisher',
        'The manifest validity window is outside its signing-key window.',
      );
    }
    if (
      environment.revokedExtensionVersions?.has(
        extensionVersionKey(payload.extensionId, payload.version),
      )
    ) {
      return fail('revoked', 'This plugin version has been revoked.');
    }

    if (
      environment.hostApiVersion < payload.hostApi.minInclusive ||
      environment.hostApiVersion >= payload.hostApi.maxExclusive
    ) {
      return fail(
        'incompatible-host',
        'This plugin needs a different host interface version.',
      );
    }
    if (
      compareVersions(
        environment.appVersion,
        payload.minAppVersion[environment.platform],
      ) < 0
    ) {
      return fail(
        'incompatible-app',
        'This plugin needs a newer app version.',
      );
    }
    if (!payload.platforms.includes(environment.platform)) {
      return fail(
        'unsupported-platform',
        'This plugin does not include an implementation for this platform.',
      );
    }

    const implementation = this.options.implementations.find(
      item => item.implementationId === payload.implementationId,
    );
    if (!implementation) {
      return fail(
        'unknown-implementation',
        'The manifest references code that is not in this app build.',
      );
    }
    if (
      implementation.extensionId !== payload.extensionId ||
      implementation.publisherId !== payload.publisherId
    ) {
      return fail(
        'implementation-identity-mismatch',
        'The approved implementation is bound to another plugin identity.',
      );
    }
    if (
      implementation.extensionPointId !== payload.extensionPointId ||
      payload.destination.id !== payload.extensionId
    ) {
      return fail(
        'extension-point-mismatch',
        'The plugin cannot mount at the requested destination.',
      );
    }
    if (!implementation.platforms.includes(environment.platform)) {
      return fail(
        'unsupported-platform',
        'The approved implementation is unavailable on this platform.',
      );
    }
    const deniedCapability = payload.requestedCapabilities.find(
      capability => !implementation.allowedCapabilities.includes(capability),
    );
    if (deniedCapability) {
      return fail(
        'capability-not-allowed',
        `The approved implementation cannot request ${deniedCapability}.`,
      );
    }
    if (!implementation.allowedHealthRisks.includes(payload.healthRisk)) {
      return fail(
        'health-risk-not-allowed',
        'The manifest declares an unapproved health-risk class.',
      );
    }
    if (
      payload.destination.targetPolicy.start &&
      !implementation.allowStartDestination
    ) {
      return fail(
        'extension-point-mismatch',
        'This implementation cannot become the start destination.',
      );
    }

    const minimumVersion = environment.minimumAcceptedVersions?.get(
      payload.extensionId,
    );
    if (
      minimumVersion !== undefined &&
      compareVersions(payload.version, minimumVersion) < 0
    ) {
      return fail(
        'downgrade-blocked',
        'The plugin version is below the locally accepted minimum.',
      );
    }
    if (!selectedForRollout(manifest, environment)) {
      return fail(
        'not-in-rollout',
        'This account and Workspace are not in the signed rollout cohort.',
      );
    }

    return manifest as VerifiedRuntimePluginManifest;
  }
}
