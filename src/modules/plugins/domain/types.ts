export const RUNTIME_PLUGIN_CAPABILITIES = [
  'glucose.summary.read',
  'destination.open',
] as const;

export type RuntimePluginCapability =
  (typeof RUNTIME_PLUGIN_CAPABILITIES)[number];

export type RuntimePluginHealthRisk = 'informational' | 'advisory';

export const RUNTIME_PLUGIN_PLATFORMS = ['ios', 'android', 'web'] as const;

export type RuntimePluginPlatform =
  (typeof RUNTIME_PLUGIN_PLATFORMS)[number];

export interface RuntimePluginScope {
  readonly productUserId: string;
  readonly workspaceId: string;
}

export interface RuntimePluginLocalizedCopy {
  readonly title: string;
  readonly description: string;
}

export interface RuntimePluginDestinationContribution {
  readonly id: string;
  readonly order: number;
  readonly copy: Readonly<{
    en: RuntimePluginLocalizedCopy;
    he: RuntimePluginLocalizedCopy;
  }>;
  readonly targetPolicy: Readonly<{
    favorite: boolean;
    start: boolean;
    shortcut: boolean;
  }>;
}

export interface RuntimePluginActivationPayload {
  readonly extensionId: string;
  readonly publisherId: string;
  readonly version: string;
  readonly hostApi: Readonly<{
    minInclusive: number;
    maxExclusive: number;
  }>;
  readonly minAppVersion: Readonly<Record<RuntimePluginPlatform, string>>;
  readonly implementationId: string;
  readonly extensionPointId: string;
  readonly platforms: readonly RuntimePluginPlatform[];
  readonly requestedCapabilities: readonly RuntimePluginCapability[];
  readonly healthRisk: RuntimePluginHealthRisk;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly enabled: boolean;
  readonly rollout: Readonly<{
    percentage: number;
    salt: string;
  }>;
  readonly destination: RuntimePluginDestinationContribution;
}

export interface RuntimePluginManifest {
  readonly schemaVersion: 1;
  readonly kind: 'activation';
  readonly payload: RuntimePluginActivationPayload;
  readonly payloadSha256: string;
  readonly signingKeyId: string;
  readonly signatureAlgorithm: 'ES256';
  readonly signature: string;
}

declare const verifiedManifestBrand: unique symbol;

/** Only the verifier may construct this branded value. */
export type VerifiedRuntimePluginManifest = RuntimePluginManifest & {
  readonly [verifiedManifestBrand]: true;
};

export interface RuntimePluginImplementation {
  readonly extensionId: string;
  readonly publisherId: string;
  readonly implementationId: string;
  readonly implementationKey: string;
  readonly extensionPointId: string;
  readonly ownerModuleId: string;
  readonly platforms: readonly RuntimePluginPlatform[];
  readonly allowedCapabilities: readonly RuntimePluginCapability[];
  readonly allowedHealthRisks: readonly RuntimePluginHealthRisk[];
  readonly allowStartDestination: boolean;
  readonly healthCheck: (
    manifest: VerifiedRuntimePluginManifest,
  ) => Promise<Readonly<{ok: true}> | Readonly<{ok: false; reason: string}>>;
}

export interface TrustedRuntimePluginSigningKey {
  readonly keyId: string;
  readonly publisherId: string;
  /** Uncompressed P-256 point: 0x04 || X || Y, encoded as base64url. */
  readonly publicKey: string;
  readonly validFrom: string;
  readonly validUntil: string;
}

export interface RuntimePluginVerificationEnvironment {
  readonly platform: RuntimePluginPlatform;
  readonly appVersion: string;
  readonly hostApiVersion: number;
  readonly nowMs: number;
  readonly scope: RuntimePluginScope;
  readonly revokedExtensionVersions?: ReadonlySet<string>;
  readonly revokedSigningKeyIds?: ReadonlySet<string>;
  readonly minimumAcceptedVersions?: ReadonlyMap<string, string>;
}

export type RuntimePluginVerificationFailureCode =
  | 'invalid-manifest'
  | 'unknown-implementation'
  | 'untrusted-publisher'
  | 'invalid-signature'
  | 'payload-hash-mismatch'
  | 'expired'
  | 'not-yet-valid'
  | 'revoked'
  | 'incompatible-host'
  | 'incompatible-app'
  | 'unsupported-platform'
  | 'capability-not-allowed'
  | 'health-risk-not-allowed'
  | 'extension-point-mismatch'
  | 'implementation-identity-mismatch'
  | 'downgrade-blocked'
  | 'not-in-rollout';

export class RuntimePluginVerificationError extends Error {
  constructor(
    readonly code: RuntimePluginVerificationFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'RuntimePluginVerificationError';
  }
}

export interface RuntimePluginGrant {
  readonly schemaVersion: 1;
  readonly productUserId: string;
  readonly workspaceId: string;
  readonly extensionId: string;
  readonly publisherId: string;
  readonly majorVersion: number;
  readonly capabilities: readonly RuntimePluginCapability[];
  readonly grantedAtMs: number;
  readonly updatedAtMs: number;
}

export interface ActivatedRuntimePlugin {
  readonly manifest: VerifiedRuntimePluginManifest;
  readonly activatedAtMs: number;
  readonly healthyAtMs: number;
}

export interface RuntimePluginQuarantineRecord {
  readonly extensionId: string;
  readonly publisherId: string;
  readonly version: string;
  readonly quarantinedAtMs: number;
  readonly reason: string;
}

export type RuntimePluginAuditEvent =
  | 'grant-added'
  | 'grant-revoked'
  | 'staged'
  | 'activated'
  | 'disabled'
  | 'health-check-failed'
  | 'rolled-back'
  | 'recovered-staging'
  | 'cached-verification-failed'
  | 'capability-allowed'
  | 'capability-denied'
  | 'capability-succeeded'
  | 'capability-failed';

export interface RuntimePluginAuditRecord {
  readonly id: string;
  readonly timestampMs: number;
  readonly extensionId: string;
  readonly version: string;
  readonly event: RuntimePluginAuditEvent;
  readonly capability?: RuntimePluginCapability;
  readonly detail?: string;
}

export interface RuntimePluginRecord {
  readonly extensionId: string;
  readonly active?: ActivatedRuntimePlugin;
  readonly rollbackCandidate?: ActivatedRuntimePlugin;
  readonly staged?: VerifiedRuntimePluginManifest;
  readonly quarantine: readonly RuntimePluginQuarantineRecord[];
  readonly minimumAcceptedVersion?: string;
  /** A host-recorded exception for one explicit/automatic LKG rollback. */
  readonly rollbackAuthorizedVersion?: string;
  readonly disabledByVersion?: string;
}

export interface RuntimePluginPersistenceSnapshot {
  readonly schemaVersion: 1;
  readonly records: readonly RuntimePluginRecord[];
  readonly grants: readonly RuntimePluginGrant[];
  readonly audit: readonly RuntimePluginAuditRecord[];
}

export interface RuntimePluginRepository {
  load(scope: RuntimePluginScope): Promise<RuntimePluginPersistenceSnapshot>;
  /** Must replace the full scope snapshot atomically. */
  commit(
    scope: RuntimePluginScope,
    snapshot: RuntimePluginPersistenceSnapshot,
  ): Promise<void>;
}

export interface RuntimePluginSignatureVerifier {
  verify(input: {
    readonly message: string;
    readonly signature: string;
    readonly key: TrustedRuntimePluginSigningKey;
  }): Promise<boolean>;
}

export interface RuntimePluginGlucoseSummaryRequest {
  readonly capability: 'glucose.summary.read';
  readonly startMs: number;
  readonly endMs: number;
}

export interface RuntimePluginOpenDestinationRequest {
  readonly capability: 'destination.open';
  readonly destinationId: string;
}

export type RuntimePluginHostRequest =
  | RuntimePluginGlucoseSummaryRequest
  | RuntimePluginOpenDestinationRequest;

export interface RuntimePluginGlucoseSummary {
  readonly unit: 'mg/dL';
  readonly startMs: number;
  readonly endMs: number;
  readonly sampleCount: number;
  readonly meanMgDl?: number;
  readonly timeInRangePercent?: number;
}

export interface RuntimePluginHostResponseByCapability {
  readonly 'glucose.summary.read': RuntimePluginGlucoseSummary;
  readonly 'destination.open': Readonly<{opened: boolean}>;
}

export type RuntimePluginHostResponse<
  Request extends RuntimePluginHostRequest,
> = RuntimePluginHostResponseByCapability[Request['capability']];

/** Host adapters return values and actions, never credentials or SDK handles. */
export interface RuntimePluginHostPort {
  execute<Request extends RuntimePluginHostRequest>(
    request: Request,
  ): Promise<RuntimePluginHostResponse<Request>>;
}

export interface RuntimePluginSession {
  readonly scope: RuntimePluginScope;
  readonly manifest: VerifiedRuntimePluginManifest;
}
