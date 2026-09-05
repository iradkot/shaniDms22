import {RUNTIME_PLUGIN_CAPABILITIES} from './types';
import type {
  ActivatedRuntimePlugin,
  RuntimePluginAuditRecord,
  RuntimePluginGrant,
  RuntimePluginPersistenceSnapshot,
  RuntimePluginQuarantineRecord,
  RuntimePluginRecord,
  RuntimePluginScope,
} from './types';
import {parseRuntimePluginManifest} from './manifestValidation';
import {parseVersion} from './version';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 400;

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const present = <Value>(value: Value | undefined): value is Value =>
  value !== undefined;

const readManifest = (
  value: unknown,
): ActivatedRuntimePlugin['manifest'] | undefined => {
  try {
    return parseRuntimePluginManifest(
      value,
    ) as ActivatedRuntimePlugin['manifest'];
  } catch {
    return undefined;
  }
};

const readGrant = (
  value: unknown,
  scope: RuntimePluginScope,
): RuntimePluginGrant | undefined => {
  if (!isObject(value)) {
    return undefined;
  }
  const capabilities = value.capabilities;
  if (
    value.schemaVersion !== 1 ||
    value.productUserId !== scope.productUserId ||
    value.workspaceId !== scope.workspaceId ||
    !isString(value.extensionId) ||
    !isString(value.publisherId) ||
    !Number.isSafeInteger(value.majorVersion) ||
    (value.majorVersion as number) < 0 ||
    !Array.isArray(capabilities) ||
    capabilities.length > RUNTIME_PLUGIN_CAPABILITIES.length ||
    capabilities.some(
      capability =>
        typeof capability !== 'string' ||
        !RUNTIME_PLUGIN_CAPABILITIES.includes(
          capability as (typeof RUNTIME_PLUGIN_CAPABILITIES)[number],
        ),
    ) ||
    new Set(capabilities).size !== capabilities.length ||
    !isTimestamp(value.grantedAtMs) ||
    !isTimestamp(value.updatedAtMs)
  ) {
    return undefined;
  }
  return value as unknown as RuntimePluginGrant;
};

const readActivated = (value: unknown): ActivatedRuntimePlugin | undefined => {
  if (
    !isObject(value) ||
    !isTimestamp(value.activatedAtMs) ||
    !isTimestamp(value.healthyAtMs)
  ) {
    return undefined;
  }
  const manifest = readManifest(value.manifest);
  return manifest
    ? {
        manifest,
        activatedAtMs: value.activatedAtMs,
        healthyAtMs: value.healthyAtMs,
      }
    : undefined;
};

const readQuarantine = (
  value: unknown,
): RuntimePluginQuarantineRecord | undefined => {
  if (
    !isObject(value) ||
    !isString(value.extensionId) ||
    !isString(value.publisherId) ||
    !isString(value.version) ||
    !isTimestamp(value.quarantinedAtMs) ||
    !isString(value.reason)
  ) {
    return undefined;
  }
  return value as unknown as RuntimePluginQuarantineRecord;
};

const readRecord = (value: unknown): RuntimePluginRecord | undefined => {
  if (!isObject(value) || !isString(value.extensionId)) {
    return undefined;
  }
  const active = readActivated(value.active);
  const rollbackCandidate = readActivated(value.rollbackCandidate);
  const quarantine = Array.isArray(value.quarantine)
    ? value.quarantine.map(readQuarantine).filter(present)
    : [];
  const staged = readManifest(value.staged);
  return {
    extensionId: value.extensionId,
    ...(active === undefined ? {} : {active}),
    ...(rollbackCandidate === undefined ? {} : {rollbackCandidate}),
    ...(staged === undefined ? {} : {staged}),
    quarantine,
    ...(isString(value.minimumAcceptedVersion) &&
    parseVersion(value.minimumAcceptedVersion)
      ? {minimumAcceptedVersion: value.minimumAcceptedVersion}
      : {}),
    ...(isString(value.rollbackAuthorizedVersion) &&
    parseVersion(value.rollbackAuthorizedVersion)
      ? {rollbackAuthorizedVersion: value.rollbackAuthorizedVersion}
      : {}),
    ...(isString(value.disabledByVersion) && parseVersion(value.disabledByVersion)
      ? {disabledByVersion: value.disabledByVersion}
      : {}),
  };
};

const readAudit = (value: unknown): RuntimePluginAuditRecord | undefined => {
  if (
    !isObject(value) ||
    !isString(value.id) ||
    !isTimestamp(value.timestampMs) ||
    !isString(value.extensionId) ||
    !isString(value.version) ||
    !isString(value.event)
  ) {
    return undefined;
  }
  return value as unknown as RuntimePluginAuditRecord;
};

/**
 * Treat local cache as untrusted input. Signed manifests are verified again by
 * the manager before any cached activation is exposed.
 */
export const sanitizeRuntimePluginSnapshot = (
  value: RuntimePluginPersistenceSnapshot,
  scope: RuntimePluginScope,
): RuntimePluginPersistenceSnapshot => {
  const raw = value as unknown as Record<string, unknown>;
  const records = Array.isArray(raw.records)
    ? raw.records.map(readRecord).filter(present)
    : [];
  const deduplicatedRecords = records.filter(
    (record, index) =>
      records.findIndex(item => item.extensionId === record.extensionId) ===
      index,
  );
  const grants = Array.isArray(raw.grants)
    ? raw.grants
        .map(item => readGrant(item, scope))
        .filter(present)
    : [];
  const audit = Array.isArray(raw.audit)
    ? raw.audit.map(readAudit).filter(present).slice(-500)
    : [];
  return {
    schemaVersion: 1,
    records: deduplicatedRecords,
    grants,
    audit,
  };
};
