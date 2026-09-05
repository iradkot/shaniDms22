import axios from 'axios';
import {getNightscoutRequestAuthentication} from './nightscoutAuthentication';

export type NightscoutAxiosConfig = {
  baseUrl: string;
  apiSecretSha1?: string | null;
  /** Account owning this configured source; used only for opaque cache scope. */
  ownerUserId?: string | null;
};

export const nightscoutInstance = axios.create({
  timeout: 5000, // 5 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

type NightscoutConfigurationListener = () => void;
const configurationListeners = new Set<NightscoutConfigurationListener>();
let configuredOwnerUserId: string | null = null;
let configuredApiSecretSha1: string | null = null;
let configurationRevision = 0;

const emitNightscoutConfigurationChange = () => {
  configurationRevision += 1;
  configurationListeners.forEach(listener => listener());
};

export const configureNightscoutInstance = (config: NightscoutAxiosConfig) => {
  const previousBaseUrl = nightscoutInstance.defaults.baseURL;
  const previousOwnerUserId = configuredOwnerUserId;
  const previousApiSecretSha1 = configuredApiSecretSha1;
  nightscoutInstance.defaults.baseURL = config.baseUrl;
  configuredOwnerUserId = config.ownerUserId?.trim() || null;
  configuredApiSecretSha1 = config.apiSecretSha1 || null;

  const nextParams = {...(nightscoutInstance.defaults.params ?? {})};
  delete nextParams.api_secret;
  delete nextParams.secret;
  delete nightscoutInstance.defaults.headers.common['api-secret'];
  const authentication = getNightscoutRequestAuthentication(
    configuredApiSecretSha1 ?? undefined,
  );
  Object.assign(
    nightscoutInstance.defaults.headers.common,
    authentication.headers,
  );
  nightscoutInstance.defaults.params = {
    ...nextParams,
    ...authentication.params,
  };

  if (
    previousBaseUrl !== config.baseUrl ||
    previousOwnerUserId !== configuredOwnerUserId ||
    previousApiSecretSha1 !== configuredApiSecretSha1
  ) {
    emitNightscoutConfigurationChange();
  }
};

/** Clears Nightscout base URL and auth header (used when no profile is active). */
export const clearNightscoutInstance = () => {
  const hadBaseUrl = !!nightscoutInstance.defaults.baseURL;
  const hadOwner = configuredOwnerUserId !== null;
  const hadCredential = configuredApiSecretSha1 !== null;
  configuredOwnerUserId = null;
  configuredApiSecretSha1 = null;
  delete nightscoutInstance.defaults.baseURL;
  const nextParams = {...(nightscoutInstance.defaults.params ?? {})};
  delete nextParams.api_secret;
  delete nextParams.secret;
  nightscoutInstance.defaults.params = nextParams;
  delete nightscoutInstance.defaults.headers.common['api-secret'];
  if (hadBaseUrl || hadOwner || hadCredential) {
    emitNightscoutConfigurationChange();
  }
};

export const getNightscoutBaseUrl = () => nightscoutInstance.defaults.baseURL;

/** Opaque subscription snapshot that exposes no source URL or credential. */
export const getNightscoutConfigurationRevision = (): number =>
  configurationRevision;

export const getNightscoutOwnerUserId = (): string | null =>
  configuredOwnerUserId;

/** Subscribe to active Nightscout Source changes without exposing credentials. */
export const subscribeNightscoutConfiguration = (
  listener: NightscoutConfigurationListener,
) => {
  configurationListeners.add(listener);
  return () => {
    configurationListeners.delete(listener);
  };
};

export const isNightscoutConfigured = () =>
  !!nightscoutInstance.defaults.baseURL;
