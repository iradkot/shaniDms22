import axios from 'axios';

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

const emitNightscoutConfigurationChange = () => {
  configurationListeners.forEach(listener => listener());
};

export const configureNightscoutInstance = (config: NightscoutAxiosConfig) => {
  const previousBaseUrl = nightscoutInstance.defaults.baseURL;
  const previousOwnerUserId = configuredOwnerUserId;
  nightscoutInstance.defaults.baseURL = config.baseUrl;
  configuredOwnerUserId = config.ownerUserId?.trim() || null;

  if (config.apiSecretSha1) {
    // Nightscout accepts api_secret as a query parameter. This avoids custom-header
    // CORS/preflight failures on web-like runtimes while still working in native.
    nightscoutInstance.defaults.params = {
      ...(nightscoutInstance.defaults.params ?? {}),
      api_secret: config.apiSecretSha1,
    };
    delete (nightscoutInstance.defaults.headers.common as any)['api-secret'];
  } else {
    const nextParams = {...(nightscoutInstance.defaults.params ?? {})};
    delete nextParams.api_secret;
    nightscoutInstance.defaults.params = nextParams;
    delete (nightscoutInstance.defaults.headers.common as any)['api-secret'];
  }

  if (
    previousBaseUrl !== config.baseUrl ||
    previousOwnerUserId !== configuredOwnerUserId
  ) {
    emitNightscoutConfigurationChange();
  }
};

/** Clears Nightscout base URL and auth header (used when no profile is active). */
export const clearNightscoutInstance = () => {
  const hadBaseUrl = !!nightscoutInstance.defaults.baseURL;
  const hadOwner = configuredOwnerUserId !== null;
  configuredOwnerUserId = null;
  delete (nightscoutInstance.defaults as any).baseURL;
  const nextParams = {...(nightscoutInstance.defaults.params ?? {})};
  delete nextParams.api_secret;
  nightscoutInstance.defaults.params = nextParams;
  delete (nightscoutInstance.defaults.headers.common as any)['api-secret'];
  if (hadBaseUrl || hadOwner) {
    emitNightscoutConfigurationChange();
  }
};

export const getNightscoutBaseUrl = () => nightscoutInstance.defaults.baseURL;

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

export const isNightscoutConfigured = () => !!nightscoutInstance.defaults.baseURL;
