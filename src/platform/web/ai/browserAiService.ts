import type {AiConversationMessage} from '../../../modules/ai';
import {WebApiError, type AuthenticatedWebApiClient} from '../api';

const AI_REQUEST_TIMEOUT_MS = 85_000;
const invalidResponse = () =>
  new WebApiError(
    502,
    'invalid_response',
    'The AI server returned an invalid response.',
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class BrowserAiService {
  constructor(
    private readonly api: Pick<AuthenticatedWebApiClient, 'requestJson'>,
    private readonly model = 'gpt-5.5',
  ) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(model)) {
      throw new Error('AI model is invalid.');
    }
  }

  async status(): Promise<boolean> {
    const value = await this.api.requestJson(
      '/v1/vault/llm/status?provider=openai',
    );
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.configured !== 'boolean'
    ) {
      throw invalidResponse();
    }
    return value.configured;
  }

  async provision(credential: string): Promise<void> {
    const normalized = credential.trim();
    if (!normalized || /\s/.test(normalized)) {
      throw new WebApiError(
        400,
        'invalid_credential',
        'The API key is invalid.',
      );
    }
    const value = await this.api.requestJson('/v1/vault/llm/provision', {
      method: 'POST',
      body: {version: 1, provider: 'openai', credential: normalized},
    });
    if (!isRecord(value) || value.version !== 1 || value.configured !== true) {
      throw invalidResponse();
    }
  }

  async remove(): Promise<void> {
    const value = await this.api.requestJson('/v1/vault/llm/remove', {
      method: 'POST',
      body: {version: 1, provider: 'openai'},
    });
    if (!isRecord(value) || value.version !== 1 || value.configured !== false) {
      throw invalidResponse();
    }
  }

  async testConnection(): Promise<void> {
    const value = await this.api.requestJson('/v1/vault/llm/test', {
      method: 'POST',
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
      body: {version: 1, provider: 'openai', model: this.model},
    });
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      value.provider !== 'openai' ||
      value.model !== this.model ||
      value.connected !== true
    ) {
      throw invalidResponse();
    }
  }

  async chat(
    messages: readonly {
      readonly role: 'system' | 'user' | 'assistant';
      readonly content: string;
    }[],
    signal?: AbortSignal,
  ): Promise<string> {
    const value = await this.api.requestJson('/v1/llm/chat', {
      method: 'POST',
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
      body: {
        version: 1,
        provider: 'openai',
        model: this.model,
        messages,
        maxOutputTokens: 2_500,
      },
      ...(signal === undefined ? {} : {signal}),
    });
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.content !== 'string' ||
      value.content.trim().length === 0 ||
      value.content.length > 200_000
    ) {
      throw invalidResponse();
    }
    return value.content.trim();
  }

  async analyzeMealImage(input: {
    readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    readonly base64: string;
    readonly instruction: string;
    readonly signal?: AbortSignal;
  }): Promise<string> {
    const value = await this.api.requestJson('/v1/llm/meal-image', {
      method: 'POST',
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
      body: {
        version: 1,
        provider: 'openai',
        model: this.model,
        instruction: input.instruction,
        image: {mimeType: input.mimeType, base64: input.base64},
      },
      ...(input.signal === undefined ? {} : {signal: input.signal}),
    });
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.content !== 'string' ||
      value.content.trim().length === 0 ||
      value.content.length > 200_000
    ) {
      throw invalidResponse();
    }
    return value.content.trim();
  }
}

export const browserAiMessages = (
  system: string,
  messages: readonly AiConversationMessage[],
) => [
  {role: 'system' as const, content: system},
  ...messages.map(message => ({role: message.role, content: message.content})),
];
