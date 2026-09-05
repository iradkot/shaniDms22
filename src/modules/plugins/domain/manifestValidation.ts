import {
  RUNTIME_PLUGIN_CAPABILITIES,
  RUNTIME_PLUGIN_PLATFORMS,
  RuntimePluginActivationPayload,
  RuntimePluginCapability,
  RuntimePluginHealthRisk,
  RuntimePluginManifest,
  RuntimePluginPlatform,
  RuntimePluginVerificationError,
} from './types';
import {parseVersion} from './version';
import {utf8Bytes} from './canonical';

type PlainObject = Record<string, unknown>;

const ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_MANIFEST_BYTES = 32 * 1024;
const MAX_SHORT_STRING = 120;
const MAX_DESCRIPTION = 320;

const invalid = (path: string, message: string): never => {
  throw new RuntimePluginVerificationError(
    'invalid-manifest',
    `${path}: ${message}`,
  );
};

const objectAt = (value: unknown, path: string): PlainObject => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(path, 'expected an object');
  }
  return value as PlainObject;
};

const exactKeys = (
  value: PlainObject,
  allowed: readonly string[],
  path: string,
): void => {
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if (unknown) {
    invalid(`${path}.${unknown}`, 'unknown field');
  }
  const missing = allowed.find(key => !(key in value));
  if (missing) {
    invalid(`${path}.${missing}`, 'missing field');
  }
};

const stringAt = (
  value: unknown,
  path: string,
  maxLength = MAX_SHORT_STRING,
): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    value.trim() !== value
  ) {
    return invalid(path, `expected a trimmed string of 1-${maxLength} chars`);
  }
  return value;
};

const idAt = (value: unknown, path: string): string => {
  const parsed = stringAt(value, path);
  if (!ID_PATTERN.test(parsed)) {
    invalid(path, 'expected a lowercase namespaced ID');
  }
  return parsed;
};

const versionAt = (value: unknown, path: string): string => {
  const parsed = stringAt(value, path, 40);
  if (!parseVersion(parsed)) {
    invalid(path, 'expected a strict major.minor.patch version');
  }
  return parsed;
};

const integerAt = (
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return invalid(path, `expected an integer from ${minimum} to ${maximum}`);
  }
  return value;
};

const booleanAt = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') {
    return invalid(path, 'expected a boolean');
  }
  return value;
};

const dateAt = (value: unknown, path: string): string => {
  const parsed = stringAt(value, path, 30);
  const time = Date.parse(parsed);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== parsed) {
    invalid(path, 'expected a canonical ISO-8601 timestamp');
  }
  return parsed;
};

const stringEnumAt = <Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
): Value => {
  if (typeof value !== 'string' || !allowed.includes(value as Value)) {
    return invalid(path, 'unknown value');
  }
  return value as Value;
};

const uniqueArrayAt = <Value extends string>(
  value: unknown,
  path: string,
  allowed: readonly Value[],
  maximum: number,
): readonly Value[] => {
  if (!Array.isArray(value) || value.length > maximum) {
    return invalid(path, `expected an array with at most ${maximum} items`);
  }
  const parsed = value.map((item, index) =>
    stringEnumAt(item, allowed, `${path}[${index}]`),
  );
  if (new Set(parsed).size !== parsed.length) {
    invalid(path, 'duplicate values are not allowed');
  }
  return parsed;
};

const readCopy = (value: unknown, path: string) => {
  const object = objectAt(value, path);
  exactKeys(object, ['title', 'description'], path);
  return {
    title: stringAt(object.title, `${path}.title`, 80),
    description: stringAt(
      object.description,
      `${path}.description`,
      MAX_DESCRIPTION,
    ),
  };
};

const readDestination = (value: unknown, path: string) => {
  const object = objectAt(value, path);
  exactKeys(object, ['id', 'order', 'copy', 'targetPolicy'], path);
  const copy = objectAt(object.copy, `${path}.copy`);
  exactKeys(copy, ['en', 'he'], `${path}.copy`);
  const policy = objectAt(object.targetPolicy, `${path}.targetPolicy`);
  exactKeys(
    policy,
    ['favorite', 'start', 'shortcut'],
    `${path}.targetPolicy`,
  );
  return {
    id: idAt(object.id, `${path}.id`),
    order: integerAt(object.order, `${path}.order`, 0, 10_000),
    copy: {
      en: readCopy(copy.en, `${path}.copy.en`),
      he: readCopy(copy.he, `${path}.copy.he`),
    },
    targetPolicy: {
      favorite: booleanAt(policy.favorite, `${path}.targetPolicy.favorite`),
      start: booleanAt(policy.start, `${path}.targetPolicy.start`),
      shortcut: booleanAt(policy.shortcut, `${path}.targetPolicy.shortcut`),
    },
  };
};

const readPayload = (value: unknown): RuntimePluginActivationPayload => {
  const path = 'manifest.payload';
  const object = objectAt(value, path);
  exactKeys(
    object,
    [
      'extensionId',
      'publisherId',
      'version',
      'hostApi',
      'minAppVersion',
      'implementationId',
      'extensionPointId',
      'platforms',
      'requestedCapabilities',
      'healthRisk',
      'issuedAt',
      'expiresAt',
      'enabled',
      'rollout',
      'destination',
    ],
    path,
  );

  const hostApi = objectAt(object.hostApi, `${path}.hostApi`);
  exactKeys(hostApi, ['minInclusive', 'maxExclusive'], `${path}.hostApi`);
  const minInclusive = integerAt(
    hostApi.minInclusive,
    `${path}.hostApi.minInclusive`,
    1,
    10_000,
  );
  const maxExclusive = integerAt(
    hostApi.maxExclusive,
    `${path}.hostApi.maxExclusive`,
    2,
    10_001,
  );
  if (maxExclusive <= minInclusive) {
    invalid(`${path}.hostApi`, 'maxExclusive must be greater than minInclusive');
  }

  const minAppVersion = objectAt(
    object.minAppVersion,
    `${path}.minAppVersion`,
  );
  exactKeys(
    minAppVersion,
    RUNTIME_PLUGIN_PLATFORMS,
    `${path}.minAppVersion`,
  );
  const parsedMinimums = RUNTIME_PLUGIN_PLATFORMS.reduce<
    Record<RuntimePluginPlatform, string>
  >(
    (result, platform) => {
      result[platform] = versionAt(
        minAppVersion[platform],
        `${path}.minAppVersion.${platform}`,
      );
      return result;
    },
    {ios: '', android: '', web: ''},
  );

  const rollout = objectAt(object.rollout, `${path}.rollout`);
  exactKeys(rollout, ['percentage', 'salt'], `${path}.rollout`);

  return {
    extensionId: idAt(object.extensionId, `${path}.extensionId`),
    publisherId: idAt(object.publisherId, `${path}.publisherId`),
    version: versionAt(object.version, `${path}.version`),
    hostApi: {minInclusive, maxExclusive},
    minAppVersion: parsedMinimums,
    implementationId: idAt(
      object.implementationId,
      `${path}.implementationId`,
    ),
    extensionPointId: idAt(
      object.extensionPointId,
      `${path}.extensionPointId`,
    ),
    platforms: uniqueArrayAt(
      object.platforms,
      `${path}.platforms`,
      RUNTIME_PLUGIN_PLATFORMS,
      RUNTIME_PLUGIN_PLATFORMS.length,
    ),
    requestedCapabilities: uniqueArrayAt<RuntimePluginCapability>(
      object.requestedCapabilities,
      `${path}.requestedCapabilities`,
      RUNTIME_PLUGIN_CAPABILITIES,
      RUNTIME_PLUGIN_CAPABILITIES.length,
    ),
    healthRisk: stringEnumAt<RuntimePluginHealthRisk>(
      object.healthRisk,
      ['informational', 'advisory'],
      `${path}.healthRisk`,
    ),
    issuedAt: dateAt(object.issuedAt, `${path}.issuedAt`),
    expiresAt: dateAt(object.expiresAt, `${path}.expiresAt`),
    enabled: booleanAt(object.enabled, `${path}.enabled`),
    rollout: {
      percentage: integerAt(
        rollout.percentage,
        `${path}.rollout.percentage`,
        0,
        100,
      ),
      salt: stringAt(rollout.salt, `${path}.rollout.salt`, 80),
    },
    destination: readDestination(object.destination, `${path}.destination`),
  };
};

export const parseRuntimePluginManifest = (
  untrusted: unknown,
): RuntimePluginManifest => {
  let encoded: string;
  try {
    encoded = JSON.stringify(untrusted);
  } catch {
    return invalid('manifest', 'must be JSON serializable');
  }
  if (typeof encoded !== 'string') {
    return invalid('manifest', 'expected a JSON object');
  }
  if (utf8Bytes(encoded).length > MAX_MANIFEST_BYTES) {
    return invalid('manifest', 'exceeds the 32 KiB limit');
  }

  const object = objectAt(untrusted, 'manifest');
  exactKeys(
    object,
    [
      'schemaVersion',
      'kind',
      'payload',
      'payloadSha256',
      'signingKeyId',
      'signatureAlgorithm',
      'signature',
    ],
    'manifest',
  );
  if (object.schemaVersion !== 1) {
    invalid('manifest.schemaVersion', 'unsupported schema version');
  }
  if (object.kind !== 'activation') {
    invalid('manifest.kind', 'expected activation');
  }
  const payloadSha256 = stringAt(
    object.payloadSha256,
    'manifest.payloadSha256',
    64,
  );
  if (!SHA256_PATTERN.test(payloadSha256)) {
    invalid('manifest.payloadSha256', 'expected lowercase SHA-256 hex');
  }
  const signature = stringAt(object.signature, 'manifest.signature', 120);
  if (!BASE64URL_PATTERN.test(signature)) {
    invalid('manifest.signature', 'expected base64url');
  }
  if (object.signatureAlgorithm !== 'ES256') {
    invalid('manifest.signatureAlgorithm', 'expected ES256');
  }
  return {
    schemaVersion: 1,
    kind: 'activation',
    payload: readPayload(object.payload),
    payloadSha256,
    signingKeyId: idAt(object.signingKeyId, 'manifest.signingKeyId'),
    signatureAlgorithm: 'ES256',
    signature,
  };
};
