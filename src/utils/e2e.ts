import {NativeModules} from 'react-native';

type E2EConfigNativeModule = {
  isE2E?: boolean;
};

const nativeIsE2E = Boolean(
  (NativeModules as unknown as {E2EConfig?: E2EConfigNativeModule})?.E2EConfig
    ?.isE2E,
);

const envIsE2E =
  typeof process !== 'undefined' &&
  (process as unknown as {env?: Record<string, string>})?.env?.E2E === 'true';

/**
 * True when the app is running in E2E mode.
 *
 * Primary source is native (`BuildConfig.E2E`) exposed via `NativeModules.E2EConfig.isE2E`.
 * We also allow a limited env fallback for local tooling.
 */
export const isE2E = nativeIsE2E || envIsE2E;
