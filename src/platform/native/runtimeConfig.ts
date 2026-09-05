import {NativeModules} from 'react-native';

export const REQUIRED_FIRESTORE_RULES_SCHEMA_VERSION = 1;

interface ShaniDmsRuntimeConfigModule {
  readonly backendBaseUrl?: unknown;
  readonly firestoreRulesSchemaVersion?: unknown;
}

export interface ShaniDmsRuntimeConfig {
  readonly backendBaseUrl?: string;
  readonly firestoreRulesSchemaVersion: number;
}

const asNonNegativeInteger = (value: unknown): number => {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' &&
    Number.isInteger(numeric) &&
    numeric >= 0
    ? numeric
    : 0;
};

export const decodeShaniDmsRuntimeConfig = (
  value: ShaniDmsRuntimeConfigModule | undefined,
): ShaniDmsRuntimeConfig => {
  const backendBaseUrl =
    typeof value?.backendBaseUrl === 'string' &&
    value.backendBaseUrl.trim().length > 0
      ? value.backendBaseUrl.trim()
      : undefined;
  return {
    ...(backendBaseUrl === undefined ? {} : {backendBaseUrl}),
    firestoreRulesSchemaVersion: asNonNegativeInteger(
      value?.firestoreRulesSchemaVersion,
    ),
  };
};

export const NATIVE_RUNTIME_CONFIG = decodeShaniDmsRuntimeConfig(
  (
    NativeModules as unknown as {
      readonly ShaniDmsRuntimeConfig?: ShaniDmsRuntimeConfigModule;
    }
  ).ShaniDmsRuntimeConfig,
);

/**
 * Remote writes fail closed unless the binary explicitly declares that its
 * deployed Firestore rules match the schema expected by this client.
 */
export const FIRESTORE_RULES_RELEASE_VERIFIED =
  NATIVE_RUNTIME_CONFIG.firestoreRulesSchemaVersion >=
  REQUIRED_FIRESTORE_RULES_SCHEMA_VERSION;
