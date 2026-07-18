import axios from 'axios';

export type NightscoutAxiosConfig = {
  baseUrl: string;
  apiSecretSha1?: string | null;
};

export const nightscoutInstance = axios.create({
  timeout: 5000, // 5 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

export const configureNightscoutInstance = (config: NightscoutAxiosConfig) => {
  nightscoutInstance.defaults.baseURL = config.baseUrl;

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
};

/** Clears Nightscout base URL and auth header (used when no profile is active). */
export const clearNightscoutInstance = () => {
  delete (nightscoutInstance.defaults as any).baseURL;
  const nextParams = {...(nightscoutInstance.defaults.params ?? {})};
  delete nextParams.api_secret;
  nightscoutInstance.defaults.params = nextParams;
  delete (nightscoutInstance.defaults.headers.common as any)['api-secret'];
};

export const getNightscoutBaseUrl = () => nightscoutInstance.defaults.baseURL;

export const isNightscoutConfigured = () => !!nightscoutInstance.defaults.baseURL;
