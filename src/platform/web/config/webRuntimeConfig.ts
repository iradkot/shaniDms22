export interface WebRuntimeConfigInput {
  readonly firebaseApiKey?: unknown;
  readonly firebaseProjectId?: unknown;
  readonly firebaseStorageBucket?: unknown;
  readonly googleClientId?: unknown;
  readonly apiBaseUrl?: unknown;
}

export interface WebRuntimeConfig {
  readonly firebaseApiKey: string;
  readonly firebaseProjectId: string;
  readonly firebaseStorageBucket: string;
  readonly googleClientId: string;
  readonly apiBaseUrl: string;
}

const requiredText = (
  value: unknown,
  label: string,
  maximumLength: number,
): string => {
  if (typeof value !== 'string') {
    throw new Error(`${label} is not configured.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new Error(`${label} is not configured.`);
  }
  return normalized;
};

const apiBaseUrl = (value: unknown): string => {
  const normalized = requiredText(value, 'Web API URL', 2_048).replace(
    /\/+$/,
    '',
  );
  let parsed: URL;
  try {
    parsed = new URL(normalized, globalThis.location?.origin);
  } catch {
    throw new Error('Web API URL is invalid.');
  }
  const localDevelopment =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.protocol !== 'https:' && !localDevelopment) {
    throw new Error('Web API URL must use HTTPS.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Web API URL is invalid.');
  }
  return parsed.href.replace(/\/+$/, '');
};

export const parseWebRuntimeConfig = (
  input: WebRuntimeConfigInput,
): WebRuntimeConfig => {
  const firebaseProjectId = requiredText(
    input.firebaseProjectId,
    'Firebase project ID',
    128,
  );
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(firebaseProjectId)) {
    throw new Error('Firebase project ID is invalid.');
  }
  const firebaseStorageBucket =
    input.firebaseStorageBucket === undefined
      ? `${firebaseProjectId}.appspot.com`
      : requiredText(
          input.firebaseStorageBucket,
          'Firebase Storage bucket',
          222,
        ).toLocaleLowerCase('en-US');
  if (
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(firebaseStorageBucket) ||
    firebaseStorageBucket.includes('..')
  ) {
    throw new Error('Firebase Storage bucket is invalid.');
  }
  const googleClientId = requiredText(
    input.googleClientId,
    'Google web client ID',
    256,
  );
  if (
    !/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(googleClientId)
  ) {
    throw new Error('Google web client ID is invalid.');
  }
  return {
    firebaseApiKey: requiredText(
      input.firebaseApiKey,
      'Firebase web API key',
      256,
    ),
    firebaseProjectId,
    firebaseStorageBucket,
    googleClientId,
    apiBaseUrl: apiBaseUrl(input.apiBaseUrl),
  };
};

export const tryParseWebRuntimeConfig = (
  input: WebRuntimeConfigInput,
):
  | {readonly ok: true; readonly value: WebRuntimeConfig}
  | {
      readonly ok: false;
      readonly message: string;
    } => {
  try {
    return {ok: true, value: parseWebRuntimeConfig(input)};
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Web configuration is invalid.',
    };
  }
};
