import {
  ShaniLlmProxyProvider,
  type LlmCredentialValidationResult,
  validateLlmCredential,
} from '../shaniLlmProxy';

export type OpenAiKeyValidationResult = LlmCredentialValidationResult;

/** Validates transiently through the authenticated ShaniDms backend. */
export const validateOpenAiApiKey = (
  apiKey: string,
): Promise<OpenAiKeyValidationResult> =>
  validateLlmCredential('openai', apiKey);

/** @deprecated Compatibility name. All traffic now uses ShaniDms. */
export class OpenAIProvider extends ShaniLlmProxyProvider {
  constructor(input: {readonly apiKey?: string} = {}) {
    super({
      provider: 'openai',
      ...(input.apiKey !== undefined ? {e2eApiKey: input.apiKey} : {}),
    });
  }
}
