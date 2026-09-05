import axios from 'axios';
import {getNightscoutRequestAuthentication} from '../api/nightscoutAuthentication';
import {decodeNightscoutGlucose} from '../api/nightscoutGlucose';

export type NightscoutConnectionTestResult = {
  ok: true;
  entriesCount: number;
  latestEntryDate?: number;
  authMethod: 'query' | 'header';
};

export type NightscoutConnectionTestErrorCode =
  | 'authentication'
  | 'not-found'
  | 'timeout'
  | 'network'
  | 'invalid-response'
  | 'unknown';

const errorMessages: Record<NightscoutConnectionTestErrorCode, string> = {
  authentication:
    'Nightscout rejected the API secret. Please check it and try again.',
  'not-found':
    'Could not find the Nightscout API. Please check the site address.',
  timeout:
    'Nightscout did not respond in time. Please check the connection and retry.',
  network:
    'Could not reach Nightscout. Please check the address and network connection.',
  'invalid-response':
    'Nightscout did not return valid glucose entries. Please check the site address.',
  unknown: 'Could not verify the Nightscout connection. Please try again.',
};

/** Typed, credential-free errors that the UI can translate without parsing messages. */
export class NightscoutConnectionTestError extends Error {
  constructor(readonly code: NightscoutConnectionTestErrorCode) {
    super(errorMessages[code]);
    this.name = 'NightscoutConnectionTestError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const classifyFailure = (failure: unknown): NightscoutConnectionTestError => {
  if (failure instanceof NightscoutConnectionTestError) {
    return failure;
  }
  if (isRecord(failure)) {
    const status = isRecord(failure.response)
      ? failure.response.status
      : undefined;
    if (status === 401 || status === 403) {
      return new NightscoutConnectionTestError('authentication');
    }
    if (status === 404) {
      return new NightscoutConnectionTestError('not-found');
    }
    if (failure.code === 'ECONNABORTED' || failure.code === 'ETIMEDOUT') {
      return new NightscoutConnectionTestError('timeout');
    }
    if (failure.request && status === undefined) {
      return new NightscoutConnectionTestError('network');
    }
  }
  // Never forward Axios messages, request URLs, headers, or server error bodies.
  return new NightscoutConnectionTestError('unknown');
};

const parseConnectionResponse = (
  data: unknown,
  authMethod: NightscoutConnectionTestResult['authMethod'],
): NightscoutConnectionTestResult => {
  if (!Array.isArray(data)) {
    throw new NightscoutConnectionTestError('invalid-response');
  }
  const readings = data
    .map(decodeNightscoutGlucose)
    .filter((sample): sample is NonNullable<typeof sample> => sample !== null);
  if (readings.length !== data.length) {
    throw new NightscoutConnectionTestError('invalid-response');
  }
  const latestEntryDate =
    readings.length > 0
      ? Math.max(...readings.map(entry => entry.date))
      : undefined;
  return {
    ok: true,
    entriesCount: data.length,
    ...(latestEntryDate === undefined ? {} : {latestEntryDate}),
    authMethod,
  };
};

export const testNightscoutConnection = async (params: {
  baseUrl: string;
  apiSecretSha1: string;
}): Promise<NightscoutConnectionTestResult> => {
  const authentication = getNightscoutRequestAuthentication(
    params.apiSecretSha1,
  );
  try {
    // Axios appends this path to baseURL, including a Nightscout sub-directory.
    // Use the exact authentication mode used for subsequent glucose requests.
    // Request SGV entries specifically; a newer calibration or fingerstick
    // entry must not hide the most recent sensor glucose from this check.
    const response = await axios.get('/api/v1/entries/sgv.json', {
      baseURL: params.baseUrl.replace(/\/+$/, ''),
      timeout: 12000,
      params: {count: 1, ...authentication.params},
      headers: {Accept: 'application/json', ...authentication.headers},
    });
    return parseConnectionResponse(
      response.data,
      'api-secret' in authentication.headers ? 'header' : 'query',
    );
  } catch (failure) {
    throw classifyFailure(failure);
  }
};
