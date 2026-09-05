import {sha256Hex} from '../domain/canonical';
import {sanitizeRuntimePluginSnapshot} from '../domain/stateCodec';
import type {
  ActivatedRuntimePlugin,
  RuntimePluginAuditEvent,
  RuntimePluginAuditRecord,
  RuntimePluginCapability,
  RuntimePluginGrant,
  RuntimePluginImplementation,
  RuntimePluginPersistenceSnapshot,
  RuntimePluginQuarantineRecord,
  RuntimePluginRecord,
  RuntimePluginRepository,
  RuntimePluginScope,
  RuntimePluginVerificationEnvironment,
  VerifiedRuntimePluginManifest,
} from '../domain/types';
import {RuntimePluginVerificationError} from '../domain/types';
import {compareVersions, majorVersion} from '../domain/version';
import {RuntimePluginManifestVerifier} from '../domain/verifyManifest';

const MAX_AUDIT_RECORDS = 500;
const MAX_QUARANTINE_RECORDS = 10;
const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;

export type RuntimePluginManagerEnvironment = Omit<
  RuntimePluginVerificationEnvironment,
  'scope' | 'minimumAcceptedVersions'
>;

export type RuntimePluginActivationResult =
  | Readonly<{
      status: 'activated';
      plugin: ActivatedRuntimePlugin;
    }>
  | Readonly<{
      status: 'disabled';
      extensionId: string;
      version: string;
    }>
  | Readonly<{
      status: 'grant-required';
      manifest: VerifiedRuntimePluginManifest;
      missingCapabilities: readonly RuntimePluginCapability[];
    }>
  | Readonly<{
      status: 'quarantined';
      extensionId: string;
      version: string;
      reason: string;
      keptVersion?: string;
    }>;

export type RuntimePluginRollbackResult =
  | Readonly<{status: 'rolled-back'; plugin: ActivatedRuntimePlugin}>
  | Readonly<{status: 'no-candidate'}>;

export interface RuntimePluginManagerSnapshot {
  readonly active: readonly ActivatedRuntimePlugin[];
  readonly unavailableForMissingGrants: readonly ActivatedRuntimePlugin[];
  readonly records: readonly RuntimePluginRecord[];
  readonly grants: readonly RuntimePluginGrant[];
  readonly audit: readonly RuntimePluginAuditRecord[];
}

export interface RuntimePluginManagerOptions {
  readonly repository: RuntimePluginRepository;
  readonly verifier: RuntimePluginManifestVerifier;
  readonly implementations: readonly RuntimePluginImplementation[];
  readonly healthTimeoutMs?: number;
  readonly now?: () => number;
}

const scopeKey = (scope: RuntimePluginScope): string =>
  `${scope.productUserId}\u0000${scope.workspaceId}`;

const assertScope = (scope: RuntimePluginScope): void => {
  if (
    scope.productUserId.trim().length === 0 ||
    scope.productUserId.length > 200 ||
    scope.workspaceId.trim().length === 0 ||
    scope.workspaceId.length > 200
  ) {
    throw new Error('Runtime Plugin scope needs a Product User and Workspace.');
  }
};

const sameGrantIdentity = (
  grant: RuntimePluginGrant,
  manifest: VerifiedRuntimePluginManifest,
  scope: RuntimePluginScope,
): boolean =>
  grant.productUserId === scope.productUserId &&
  grant.workspaceId === scope.workspaceId &&
  grant.extensionId === manifest.payload.extensionId &&
  grant.publisherId === manifest.payload.publisherId &&
  grant.majorVersion === majorVersion(manifest.payload.version);

const missingCapabilities = (
  snapshot: RuntimePluginPersistenceSnapshot,
  manifest: VerifiedRuntimePluginManifest,
  scope: RuntimePluginScope,
): readonly RuntimePluginCapability[] => {
  const grant = snapshot.grants.find(item =>
    sameGrantIdentity(item, manifest, scope),
  );
  return manifest.payload.requestedCapabilities.filter(
    capability => !grant?.capabilities.includes(capability),
  );
};

const withoutUndefined = <Value>(
  value: Value | undefined,
): value is Value => value !== undefined;

type MutableRuntimePluginRecord = {
  -readonly [Key in keyof RuntimePluginRecord]: RuntimePluginRecord[Key];
};

const withoutRecordFields = (
  record: RuntimePluginRecord,
  fields: readonly (keyof RuntimePluginRecord)[],
): RuntimePluginRecord => {
  const mutable: MutableRuntimePluginRecord = {...record};
  fields.forEach(field => {
    delete mutable[field];
  });
  return mutable;
};

export class RuntimePluginManager {
  private readonly repository: RuntimePluginRepository;
  private readonly verifier: RuntimePluginManifestVerifier;
  private readonly implementations: readonly RuntimePluginImplementation[];
  private readonly healthTimeoutMs: number;
  private readonly now: () => number;
  private readonly queues = new Map<string, Promise<void>>();
  private auditSequence = 0;

  constructor(options: RuntimePluginManagerOptions) {
    this.repository = options.repository;
    this.verifier = options.verifier;
    this.implementations = options.implementations;
    this.healthTimeoutMs =
      options.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
    if (
      !Number.isSafeInteger(this.healthTimeoutMs) ||
      this.healthTimeoutMs <= 0 ||
      this.healthTimeoutMs > 30_000
    ) {
      throw new Error('Runtime Plugin health timeout must be 1-30000 ms.');
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
    this.now = options.now ?? Date.now;
  }

  private async exclusive<Value>(
    scope: RuntimePluginScope,
    operation: () => Promise<Value>,
  ): Promise<Value> {
    assertScope(scope);
    const key = scopeKey(scope);
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => gate);
    this.queues.set(key, queued);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.queues.get(key) === queued) {
        this.queues.delete(key);
      }
    }
  }

  private async load(scope: RuntimePluginScope) {
    return sanitizeRuntimePluginSnapshot(
      await this.repository.load(scope),
      scope,
    );
  }

  private audit(
    snapshot: RuntimePluginPersistenceSnapshot,
    input: {
      readonly extensionId: string;
      readonly version: string;
      readonly event: RuntimePluginAuditEvent;
      readonly capability?: RuntimePluginCapability;
      readonly detail?: string;
    },
  ): readonly RuntimePluginAuditRecord[] {
    const timestampMs = this.now();
    this.auditSequence += 1;
    const record: RuntimePluginAuditRecord = {
      id: sha256Hex(
        `${input.extensionId}\u0000${input.version}\u0000${timestampMs}\u0000${this.auditSequence}`,
      ),
      timestampMs,
      extensionId: input.extensionId,
      version: input.version,
      event: input.event,
      ...(input.capability === undefined
        ? {}
        : {capability: input.capability}),
      ...(input.detail === undefined ? {} : {detail: input.detail.slice(0, 240)}),
    };
    return [...snapshot.audit, record].slice(-MAX_AUDIT_RECORDS);
  }

  private withRecord(
    snapshot: RuntimePluginPersistenceSnapshot,
    record: RuntimePluginRecord,
    audit: readonly RuntimePluginAuditRecord[] = snapshot.audit,
  ): RuntimePluginPersistenceSnapshot {
    return {
      schemaVersion: 1,
      records: [
        ...snapshot.records.filter(
          item => item.extensionId !== record.extensionId,
        ),
        record,
      ],
      grants: snapshot.grants,
      audit,
    };
  }

  private environment(
    scope: RuntimePluginScope,
    base: RuntimePluginManagerEnvironment,
    snapshot: RuntimePluginPersistenceSnapshot,
    ignoreMinimumForExtensionId?: string,
  ): RuntimePluginVerificationEnvironment {
    const minimumAcceptedVersions = new Map(
      snapshot.records
        .filter(
          record =>
            record.minimumAcceptedVersion !== undefined &&
            record.extensionId !== ignoreMinimumForExtensionId,
        )
        .map(record => [record.extensionId, record.minimumAcceptedVersion!]),
    );
    return {...base, scope, minimumAcceptedVersions};
  }

  private implementation(manifest: VerifiedRuntimePluginManifest) {
    return this.implementations.find(
      item => item.implementationId === manifest.payload.implementationId,
    );
  }

  private async healthCheck(
    manifest: VerifiedRuntimePluginManifest,
  ): Promise<Readonly<{ok: true}> | Readonly<{ok: false; reason: string}>> {
    const implementation = this.implementation(manifest);
    if (!implementation) {
      return {ok: false, reason: 'The approved implementation is unavailable.'};
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Readonly<{ok: false; reason: string}>>(
      resolve => {
        timer = setTimeout(
          () => resolve({ok: false, reason: 'Health check timed out.'}),
          this.healthTimeoutMs,
        );
      },
    );
    try {
      return await Promise.race([
        implementation.healthCheck(manifest).catch(() => ({
          ok: false as const,
          reason: 'Health check failed unexpectedly.',
        })),
        timeout,
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private quarantine(
    record: RuntimePluginRecord,
    manifest: VerifiedRuntimePluginManifest,
    reason: string,
  ): RuntimePluginRecord {
    const quarantineRecord: RuntimePluginQuarantineRecord = {
      extensionId: manifest.payload.extensionId,
      publisherId: manifest.payload.publisherId,
      version: manifest.payload.version,
      quarantinedAtMs: this.now(),
      reason: reason.slice(0, 240),
    };
    return {
      ...record,
      quarantine: [...record.quarantine, quarantineRecord].slice(
        -MAX_QUARANTINE_RECORDS,
      ),
    };
  }

  async activate(
    scope: RuntimePluginScope,
    untrustedManifest: unknown,
    baseEnvironment: RuntimePluginManagerEnvironment,
  ): Promise<RuntimePluginActivationResult> {
    return this.exclusive(scope, async () => {
      let snapshot = await this.load(scope);
      snapshot = await this.recoverStaging(scope, snapshot);
      const manifest = await this.verifier.verify(
        untrustedManifest,
        this.environment(scope, baseEnvironment, snapshot),
      );
      const existing = snapshot.records.find(
        item => item.extensionId === manifest.payload.extensionId,
      );
      const record: RuntimePluginRecord = existing ?? {
        extensionId: manifest.payload.extensionId,
        quarantine: [],
      };
      if (
        record.quarantine.some(
          item => item.version === manifest.payload.version,
        )
      ) {
        return {
          status: 'quarantined',
          extensionId: manifest.payload.extensionId,
          version: manifest.payload.version,
          reason: 'This exact version previously failed its health check.',
          ...(record.active === undefined
            ? {}
            : {keptVersion: record.active.manifest.payload.version}),
        };
      }

      if (manifest.payload.enabled) {
        const missing = missingCapabilities(snapshot, manifest, scope);
        if (missing.length > 0) {
          return {
            status: 'grant-required',
            manifest,
            missingCapabilities: missing,
          };
        }
      }

      const stagedRecord: RuntimePluginRecord = {...record, staged: manifest};
      snapshot = this.withRecord(
        snapshot,
        stagedRecord,
        this.audit(snapshot, {
          extensionId: manifest.payload.extensionId,
          version: manifest.payload.version,
          event: 'staged',
        }),
      );
      await this.repository.commit(scope, snapshot);

      if (!manifest.payload.enabled) {
        const disabledRecord: RuntimePluginRecord = {
          ...withoutRecordFields(stagedRecord, [
            'active',
            'staged',
            'rollbackAuthorizedVersion',
          ]),
          ...(record.active === undefined
            ? {}
            : {rollbackCandidate: record.active}),
          disabledByVersion: manifest.payload.version,
          minimumAcceptedVersion:
            record.minimumAcceptedVersion === undefined ||
            compareVersions(
              manifest.payload.version,
              record.minimumAcceptedVersion,
            ) > 0
              ? manifest.payload.version
              : record.minimumAcceptedVersion,
        };
        snapshot = this.withRecord(
          snapshot,
          disabledRecord,
          this.audit(snapshot, {
            extensionId: manifest.payload.extensionId,
            version: manifest.payload.version,
            event: 'disabled',
          }),
        );
        await this.repository.commit(scope, snapshot);
        return {
          status: 'disabled',
          extensionId: manifest.payload.extensionId,
          version: manifest.payload.version,
        };
      }

      const health = await this.healthCheck(manifest);
      if (!health.ok) {
        const quarantinedRecord = this.quarantine(
          withoutRecordFields(stagedRecord, ['staged']),
          manifest,
          health.reason,
        );
        snapshot = this.withRecord(
          snapshot,
          quarantinedRecord,
          this.audit(snapshot, {
            extensionId: manifest.payload.extensionId,
            version: manifest.payload.version,
            event: 'health-check-failed',
            detail: health.reason,
          }),
        );
        await this.repository.commit(scope, snapshot);
        return {
          status: 'quarantined',
          extensionId: manifest.payload.extensionId,
          version: manifest.payload.version,
          reason: health.reason,
          ...(record.active === undefined
            ? {}
            : {keptVersion: record.active.manifest.payload.version}),
        };
      }

      const nowMs = this.now();
      const active: ActivatedRuntimePlugin = {
        manifest,
        activatedAtMs: nowMs,
        healthyAtMs: nowMs,
      };
      const activatedRecord: RuntimePluginRecord = {
        ...withoutRecordFields(stagedRecord, [
          'staged',
          'disabledByVersion',
          'rollbackAuthorizedVersion',
        ]),
        active,
        ...(record.active === undefined
          ? {}
          : {rollbackCandidate: record.active}),
        minimumAcceptedVersion:
          record.minimumAcceptedVersion === undefined ||
          compareVersions(
            manifest.payload.version,
            record.minimumAcceptedVersion,
          ) > 0
            ? manifest.payload.version
            : record.minimumAcceptedVersion,
      };
      snapshot = this.withRecord(
        snapshot,
        activatedRecord,
        this.audit(snapshot, {
          extensionId: manifest.payload.extensionId,
          version: manifest.payload.version,
          event: 'activated',
        }),
      );
      await this.repository.commit(scope, snapshot);
      return {status: 'activated', plugin: active};
    });
  }

  async grant(
    scope: RuntimePluginScope,
    manifest: VerifiedRuntimePluginManifest,
    capabilities: readonly RuntimePluginCapability[],
  ): Promise<void> {
    await this.exclusive(scope, async () => {
      const snapshot = await this.load(scope);
      const requested = manifest.payload.requestedCapabilities;
      const invalidCapability = capabilities.find(
        capability => !requested.includes(capability),
      );
      if (invalidCapability) {
        throw new Error(
          `Cannot grant an undeclared plugin capability: ${invalidCapability}`,
        );
      }
      const existing = snapshot.grants.find(item =>
        sameGrantIdentity(item, manifest, scope),
      );
      const nowMs = this.now();
      const merged = Array.from(
        new Set([...(existing?.capabilities ?? []), ...capabilities]),
      );
      const grant: RuntimePluginGrant = {
        schemaVersion: 1,
        productUserId: scope.productUserId,
        workspaceId: scope.workspaceId,
        extensionId: manifest.payload.extensionId,
        publisherId: manifest.payload.publisherId,
        majorVersion: majorVersion(manifest.payload.version),
        capabilities: merged,
        grantedAtMs: existing?.grantedAtMs ?? nowMs,
        updatedAtMs: nowMs,
      };
      let next: RuntimePluginPersistenceSnapshot = {
        ...snapshot,
        grants: [
          ...snapshot.grants.filter(
            item => !sameGrantIdentity(item, manifest, scope),
          ),
          grant,
        ],
      };
      next = {
        ...next,
        audit: capabilities.reduce(
          (audit, capability) =>
            this.audit({...next, audit}, {
              extensionId: manifest.payload.extensionId,
              version: manifest.payload.version,
              event: 'grant-added',
              capability,
            }),
          next.audit,
        ),
      };
      await this.repository.commit(scope, next);
    });
  }

  async revoke(
    scope: RuntimePluginScope,
    identity: Readonly<{
      extensionId: string;
      publisherId: string;
      majorVersion: number;
    }>,
    capabilities?: readonly RuntimePluginCapability[],
  ): Promise<void> {
    await this.exclusive(scope, async () => {
      const snapshot = await this.load(scope);
      const existing = snapshot.grants.find(
        grant =>
          grant.extensionId === identity.extensionId &&
          grant.publisherId === identity.publisherId &&
          grant.majorVersion === identity.majorVersion,
      );
      if (!existing) {
        return;
      }
      const revoked = capabilities ?? existing.capabilities;
      const remaining = existing.capabilities.filter(
        capability => !revoked.includes(capability),
      );
      const nextGrant =
        remaining.length === 0
          ? undefined
          : {...existing, capabilities: remaining, updatedAtMs: this.now()};
      let next: RuntimePluginPersistenceSnapshot = {
        ...snapshot,
        grants: [
          ...snapshot.grants.filter(item => item !== existing),
          nextGrant,
        ].filter(withoutUndefined),
      };
      next = {
        ...next,
        audit: revoked.reduce(
          (audit, capability) =>
            this.audit({...next, audit}, {
              extensionId: identity.extensionId,
              version: `${identity.majorVersion}.x`,
              event: 'grant-revoked',
              capability,
            }),
          next.audit,
        ),
      };
      await this.repository.commit(scope, next);
    });
  }

  async rollback(
    scope: RuntimePluginScope,
    extensionId: string,
    baseEnvironment: RuntimePluginManagerEnvironment,
    reason: string,
  ): Promise<RuntimePluginRollbackResult> {
    return this.exclusive(scope, async () => {
      let snapshot = await this.load(scope);
      snapshot = await this.recoverStaging(scope, snapshot);
      const record = snapshot.records.find(
        item => item.extensionId === extensionId,
      );
      if (!record?.rollbackCandidate) {
        return {status: 'no-candidate'};
      }
      const candidateManifest = await this.verifier.verify(
        record.rollbackCandidate.manifest,
        this.environment(scope, baseEnvironment, snapshot, extensionId),
      );
      if (missingCapabilities(snapshot, candidateManifest, scope).length > 0) {
        return {status: 'no-candidate'};
      }
      const health = await this.healthCheck(candidateManifest);
      if (!health.ok) {
        return {status: 'no-candidate'};
      }
      const failedActive = record.active;
      const rolledBack: ActivatedRuntimePlugin = {
        manifest: candidateManifest,
        activatedAtMs: this.now(),
        healthyAtMs: this.now(),
      };
      let nextRecord: RuntimePluginRecord = {
        ...withoutRecordFields(record, [
          'rollbackCandidate',
          'disabledByVersion',
        ]),
        active: rolledBack,
        rollbackAuthorizedVersion: candidateManifest.payload.version,
      };
      if (failedActive) {
        nextRecord = this.quarantine(
          nextRecord,
          failedActive.manifest,
          reason,
        );
      }
      snapshot = this.withRecord(
        snapshot,
        nextRecord,
        this.audit(snapshot, {
          extensionId,
          version: candidateManifest.payload.version,
          event: 'rolled-back',
          detail: reason,
        }),
      );
      await this.repository.commit(scope, snapshot);
      return {status: 'rolled-back', plugin: rolledBack};
    });
  }

  private async recoverStaging(
    scope: RuntimePluginScope,
    snapshot: RuntimePluginPersistenceSnapshot,
  ): Promise<RuntimePluginPersistenceSnapshot> {
    const stagedRecords = snapshot.records.filter(
      record => record.staged !== undefined,
    );
    if (stagedRecords.length === 0) {
      return snapshot;
    }
    let next = snapshot;
    stagedRecords.forEach(record => {
      const manifest = record.staged!;
      const recovered = this.quarantine(
        withoutRecordFields(record, ['staged']),
        manifest,
        'Activation was interrupted before the health check completed.',
      );
      next = this.withRecord(
        next,
        recovered,
        this.audit(next, {
          extensionId: manifest.payload.extensionId,
          version: manifest.payload.version,
          event: 'recovered-staging',
        }),
      );
    });
    await this.repository.commit(scope, next);
    return next;
  }

  async snapshot(
    scope: RuntimePluginScope,
    baseEnvironment: RuntimePluginManagerEnvironment,
  ): Promise<RuntimePluginManagerSnapshot> {
    return this.exclusive(scope, async () => {
      let snapshot = await this.load(scope);
      snapshot = await this.recoverStaging(scope, snapshot);
      const verifiedActive: ActivatedRuntimePlugin[] = [];
      let changed = false;
      const nextRecords: RuntimePluginRecord[] = [];
      let nextAudit = snapshot.audit;

      for (const record of snapshot.records) {
        if (!record.active) {
          nextRecords.push(record);
          continue;
        }
        try {
          const manifest = await this.verifier.verify(
            record.active.manifest,
            this.environment(
              scope,
              baseEnvironment,
              snapshot,
              record.rollbackAuthorizedVersion ===
                record.active.manifest.payload.version
                ? record.extensionId
                : undefined,
            ),
          );
          const active = {...record.active, manifest};
          verifiedActive.push(active);
          nextRecords.push({...record, active});
        } catch (caught) {
          changed = true;
          const reason =
            caught instanceof RuntimePluginVerificationError
              ? caught.message
              : 'Cached activation could not be verified.';
          nextAudit = this.audit({...snapshot, audit: nextAudit}, {
            extensionId: record.active.manifest.payload.extensionId,
            version: record.active.manifest.payload.version,
            event: 'cached-verification-failed',
            detail: reason,
          });
          let recoveredRecord = this.quarantine(
            withoutRecordFields(record, ['active']),
            record.active.manifest,
            reason,
          );
          if (record.rollbackCandidate) {
            try {
              const fallbackManifest = await this.verifier.verify(
                record.rollbackCandidate.manifest,
                this.environment(
                  scope,
                  baseEnvironment,
                  snapshot,
                  record.extensionId,
                ),
              );
              const fallbackHealth = await this.healthCheck(fallbackManifest);
              if (
                fallbackHealth.ok &&
                missingCapabilities(snapshot, fallbackManifest, scope).length ===
                  0
              ) {
                const fallback: ActivatedRuntimePlugin = {
                  manifest: fallbackManifest,
                  activatedAtMs: this.now(),
                  healthyAtMs: this.now(),
                };
                recoveredRecord = {
                  ...withoutRecordFields(recoveredRecord, [
                    'rollbackCandidate',
                    'disabledByVersion',
                  ]),
                  active: fallback,
                  rollbackAuthorizedVersion:
                    fallbackManifest.payload.version,
                };
                verifiedActive.push(fallback);
                nextAudit = this.audit({...snapshot, audit: nextAudit}, {
                  extensionId: record.extensionId,
                  version: fallbackManifest.payload.version,
                  event: 'rolled-back',
                  detail: 'Recovered after cached activation verification failed.',
                });
              }
            } catch {
              // Core reviewed functionality remains available when no plugin
              // rollback candidate can itself be verified and health-checked.
            }
          }
          nextRecords.push(recoveredRecord);
        }
      }

      if (changed) {
        snapshot = {...snapshot, records: nextRecords, audit: nextAudit};
        await this.repository.commit(scope, snapshot);
      } else {
        snapshot = {...snapshot, records: nextRecords};
      }

      const active = verifiedActive.filter(
        plugin => missingCapabilities(snapshot, plugin.manifest, scope).length === 0,
      );
      const unavailableForMissingGrants = verifiedActive.filter(
        plugin => missingCapabilities(snapshot, plugin.manifest, scope).length > 0,
      );
      return {
        active,
        unavailableForMissingGrants,
        records: snapshot.records,
        grants: snapshot.grants,
        audit: snapshot.audit,
      };
    });
  }

  async authorizeCapability(
    scope: RuntimePluginScope,
    manifest: VerifiedRuntimePluginManifest,
    capability: RuntimePluginCapability,
  ): Promise<boolean> {
    return this.exclusive(scope, async () => {
      const snapshot = await this.load(scope);
      const record = snapshot.records.find(
        item => item.extensionId === manifest.payload.extensionId,
      );
      const activeManifest = record?.active?.manifest;
      const active =
        activeManifest?.payload.publisherId === manifest.payload.publisherId &&
        activeManifest.payload.version === manifest.payload.version &&
        activeManifest.payloadSha256 === manifest.payloadSha256 &&
        activeManifest.signature === manifest.signature &&
        record?.disabledByVersion === undefined;
      const allowed =
        active &&
        manifest.payload.requestedCapabilities.includes(capability) &&
        !missingCapabilities(snapshot, manifest, scope).includes(capability);
      await this.repository.commit(scope, {
        ...snapshot,
        audit: this.audit(snapshot, {
          extensionId: manifest.payload.extensionId,
          version: manifest.payload.version,
          event: allowed ? 'capability-allowed' : 'capability-denied',
          capability,
        }),
      });
      return allowed;
    });
  }

  async recordCapabilityResult(
    scope: RuntimePluginScope,
    manifest: VerifiedRuntimePluginManifest,
    capability: RuntimePluginCapability,
    succeeded: boolean,
    detail: string,
  ): Promise<void> {
    await this.exclusive(scope, async () => {
      const snapshot = await this.load(scope);
      await this.repository.commit(scope, {
        ...snapshot,
        audit: this.audit(snapshot, {
          extensionId: manifest.payload.extensionId,
          version: manifest.payload.version,
          event: succeeded ? 'capability-succeeded' : 'capability-failed',
          capability,
          detail,
        }),
      });
    });
  }
}
