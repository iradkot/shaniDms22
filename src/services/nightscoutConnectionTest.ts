import axios from 'axios';

export type NightscoutConnectionTestResult = {
  ok: true;
  entriesCount: number;
  latestEntryDate?: number;
};

const isNightscoutEntriesPayload = (value: unknown): value is any[] => Array.isArray(value);

const messageFromError = (error: any): string => {
  const status = error?.response?.status;
  if (status === 401 || status === 403) {
    return 'Nightscout rejected the API secret/token. Please check the secret and try again.';
  }

  if (status === 404) {
    return 'Could not find the Nightscout API at this URL. Please check the site address.';
  }

  if (typeof status === 'number') {
    return `Nightscout returned HTTP ${status}. Please check the URL and API secret.`;
  }

  if (error?.code === 'ECONNABORTED') {
    return 'Nightscout did not respond in time. Please check the URL and network connection.';
  }

  if (error?.request) {
    return 'Could not reach Nightscout. Please check the URL and network connection.';
  }

  return error?.message ?? 'Could not verify the Nightscout connection.';
};

export const testNightscoutConnection = async (params: {
  baseUrl: string;
  apiSecretSha1: string;
}): Promise<NightscoutConnectionTestResult> => {
  try {
    const response = await axios.get('/api/v1/entries.json?count=1', {
      baseURL: params.baseUrl,
      timeout: 7000,
      headers: {
        'Content-Type': 'application/json',
        'api-secret': params.apiSecretSha1,
      },
    });

    if (!isNightscoutEntriesPayload(response.data)) {
      throw new Error('Nightscout responded, but not with glucose entries. Please check the site URL.');
    }

    const latest = response.data[0];
    const latestEntryDate =
      typeof latest?.date === 'number' && Number.isFinite(latest.date)
        ? latest.date
        : undefined;

    return {
      ok: true,
      entriesCount: response.data.length,
      latestEntryDate,
    };
  } catch (error: any) {
    throw new Error(messageFromError(error));
  }
};
