export type SupportedProvider = 'openai';
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatRequest {
  readonly version: 1;
  readonly provider: SupportedProvider;
  readonly model: string;
  readonly messages: readonly {
    readonly role: ChatRole;
    readonly content: string;
  }[];
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface CredentialRequest {
  readonly version: 1;
  readonly provider: SupportedProvider;
  readonly credential: string;
}

export interface ProviderRequest {
  readonly version: 1;
  readonly provider: SupportedProvider;
}

export interface ConnectionTestRequest extends ProviderRequest {
  readonly model: string;
}

export interface MealImageRequest {
  readonly version: 1;
  readonly provider: SupportedProvider;
  readonly model: string;
  readonly instruction: string;
  readonly image: {
    readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    readonly base64: string;
  };
}

export interface NightscoutCredentialRequest {
  readonly version: 1;
  readonly url: string;
  readonly apiKey: string;
}

export type NightscoutRangeKind =
  | 'entries'
  | 'treatments'
  | 'profile'
  | 'devicestatus';

export interface NightscoutRangeRequest {
  readonly version: 1;
  readonly kind: NightscoutRangeKind;
  readonly startMs: number;
  readonly endMs: number;
}

export interface AuthenticatedNightscoutRangeRequest
  extends NightscoutRangeRequest {
  readonly sourceId: string;
  readonly workspaceId: string;
}

export class ApiContractError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiContractError';
    this.status = status;
    this.code = code;
  }
}

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiContractError(400, 'invalid_request', 'JSON object required');
  }
  return value as Record<string, unknown>;
};

const exactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): void => {
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new ApiContractError(400, 'invalid_request', 'Unknown request field');
  }
};

const provider = (value: unknown): SupportedProvider => {
  if (value !== 'openai') {
    throw new ApiContractError(400, 'unsupported_provider', 'Unsupported provider');
  }
  return value;
};

const version = (value: unknown): 1 => {
  if (value !== 1) {
    throw new ApiContractError(400, 'invalid_request', 'Unsupported contract version');
  }
  return 1;
};

const opaqueIdentity = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9._-]{1,160}$/.test(value)
  ) {
    throw new ApiContractError(
      400,
      'invalid_request',
      'Invalid Nightscout identity',
    );
  }
  return value;
};

const model = (value: unknown, allowedModels: ReadonlySet<string>): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    !allowedModels.has(value)
  ) {
    throw new ApiContractError(400, 'unsupported_model', 'Unsupported model');
  }
  return value;
};

export const decodeCredentialRequest = (value: unknown): CredentialRequest => {
  const input = record(value);
  exactKeys(input, ['version', 'provider', 'credential']);
  const credential = input.credential;
  if (
    typeof credential !== 'string' ||
    credential.trim().length === 0 ||
    credential.length > 4_096
  ) {
    throw new ApiContractError(400, 'invalid_credential', 'Invalid credential');
  }
  return {
    version: version(input.version),
    provider: provider(input.provider),
    credential: credential.trim(),
  };
};

export const decodeProviderRequest = (value: unknown): ProviderRequest => {
  const input = record(value);
  exactKeys(input, ['version', 'provider']);
  return {
    version: version(input.version),
    provider: provider(input.provider),
  };
};

export const decodeConnectionTestRequest = (
  value: unknown,
  allowedModels: ReadonlySet<string>,
): ConnectionTestRequest => {
  const input = record(value);
  exactKeys(input, ['version', 'provider', 'model']);
  return {
    version: version(input.version),
    provider: provider(input.provider),
    model: model(input.model, allowedModels),
  };
};

export const decodeChatRequest = (
  value: unknown,
  allowedModels: ReadonlySet<string>,
): ChatRequest => {
  const input = record(value);
  exactKeys(input, [
    'version',
    'provider',
    'model',
    'messages',
    'temperature',
    'maxOutputTokens',
  ]);
  if (
    !Array.isArray(input.messages) ||
    input.messages.length === 0 ||
    input.messages.length > 96
  ) {
    throw new ApiContractError(400, 'invalid_messages', 'Invalid messages');
  }
  let totalChars = 0;
  const messages = input.messages.map(item => {
    const message = record(item);
    exactKeys(message, ['role', 'content']);
    if (
      !['system', 'user', 'assistant'].includes(String(message.role)) ||
      typeof message.content !== 'string' ||
      message.content.length === 0 ||
      message.content.length > 200_000
    ) {
      throw new ApiContractError(400, 'invalid_messages', 'Invalid message');
    }
    totalChars += message.content.length;
    return {
      role: message.role as ChatRole,
      content: message.content,
    };
  });
  if (totalChars > 480_000) {
    throw new ApiContractError(413, 'request_too_large', 'AI context is too large');
  }
  const temperature = input.temperature;
  if (
    temperature !== undefined &&
    (typeof temperature !== 'number' ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2)
  ) {
    throw new ApiContractError(400, 'invalid_request', 'Invalid temperature');
  }
  const maxOutputTokens = input.maxOutputTokens;
  if (
    maxOutputTokens !== undefined &&
    (typeof maxOutputTokens !== 'number' ||
      !Number.isInteger(maxOutputTokens) ||
      maxOutputTokens < 1 ||
      maxOutputTokens > 16_384)
  ) {
    throw new ApiContractError(400, 'invalid_request', 'Invalid output limit');
  }
  return {
    version: version(input.version),
    provider: provider(input.provider),
    model: model(input.model, allowedModels),
    messages,
    ...(temperature === undefined ? {} : {temperature}),
    ...(maxOutputTokens === undefined ? {} : {maxOutputTokens}),
  };
};

export const decodeMealImageRequest = (
  value: unknown,
  allowedModels: ReadonlySet<string>,
): MealImageRequest => {
  const input = record(value);
  exactKeys(input, ['version', 'provider', 'model', 'instruction', 'image']);
  if (
    typeof input.instruction !== 'string' ||
    input.instruction.length === 0 ||
    input.instruction.length > 12_000
  ) {
    throw new ApiContractError(400, 'invalid_request', 'Invalid image instruction');
  }
  const image = record(input.image);
  exactKeys(image, ['mimeType', 'base64']);
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(String(image.mimeType)) ||
    typeof image.base64 !== 'string' ||
    image.base64.length === 0 ||
    image.base64.length > 8_000_000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)
  ) {
    throw new ApiContractError(400, 'invalid_image', 'Invalid meal image');
  }
  const decodedBytes = Math.floor((image.base64.length * 3) / 4);
  if (decodedBytes > 6_000_000) {
    throw new ApiContractError(413, 'request_too_large', 'Meal image is too large');
  }
  return {
    version: version(input.version),
    provider: provider(input.provider),
    model: model(input.model, allowedModels),
    instruction: input.instruction,
    image: {
      mimeType: image.mimeType as MealImageRequest['image']['mimeType'],
      base64: image.base64,
    },
  };
};

export const decodeNightscoutCredentialRequest = (
  value: unknown,
): NightscoutCredentialRequest => {
  const input = record(value);
  exactKeys(input, ['version', 'url', 'apiKey']);
  if (
    typeof input.url !== 'string' ||
    input.url.length === 0 ||
    input.url.length > 2_048
  ) {
    throw new ApiContractError(400, 'invalid_nightscout_url', 'Invalid Nightscout URL');
  }
  if (
    typeof input.apiKey !== 'string' ||
    input.apiKey.trim().length < 8 ||
    input.apiKey.length > 4_096
  ) {
    throw new ApiContractError(
      400,
      'invalid_nightscout_credential',
      'Invalid Nightscout credential',
    );
  }
  return {
    version: version(input.version),
    url: input.url.trim(),
    apiKey: input.apiKey.trim(),
  };
};

const finiteTimestamp = (value: unknown): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 8_640_000_000_000_000
  ) {
    throw new ApiContractError(400, 'invalid_range', 'Invalid Nightscout range');
  }
  return value;
};

export const decodeNightscoutRangeRequest = (
  value: unknown,
): AuthenticatedNightscoutRangeRequest => {
  const input = record(value);
  exactKeys(input, [
    'version',
    'kind',
    'sourceId',
    'workspaceId',
    'startMs',
    'endMs',
  ]);
  const startMs = finiteTimestamp(input.startMs);
  const endMs = finiteTimestamp(input.endMs);
  const kind = String(input.kind);
  const maximumRangeMs =
    kind === 'devicestatus'
      ? 2 * 60 * 60 * 1_000
      : 31 * 24 * 60 * 60 * 1_000;
  if (
    !['entries', 'treatments', 'profile', 'devicestatus'].includes(kind) ||
    endMs < startMs ||
    endMs - startMs > maximumRangeMs
  ) {
    throw new ApiContractError(400, 'invalid_range', 'Invalid Nightscout range');
  }
  return {
    version: version(input.version),
    kind: kind as NightscoutRangeKind,
    sourceId: opaqueIdentity(input.sourceId),
    workspaceId: opaqueIdentity(input.workspaceId),
    startMs,
    endMs,
  };
};
