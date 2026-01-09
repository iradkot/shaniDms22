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
    nightscoutInstance.defaults.headers.common['api-secret'] = config.apiSecretSha1;
  } else {
    delete (nightscoutInstance.defaults.headers.common as any)['api-secret'];
  }
};

export const getNightscoutBaseUrl = () => nightscoutInstance.defaults.baseURL;

export const isNightscoutConfigured = () => !!nightscoutInstance.defaults.baseURL;
