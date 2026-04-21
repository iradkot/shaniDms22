import {LlmProvider} from './llmTypes';
import {OpenAIProvider} from './providers/openaiProvider';
import {AiSettings} from 'app/contexts/AiSettingsContext';

type LlmProviderSettings = Pick<AiSettings, 'provider' | 'apiKey'>;

export function createLlmProvider(settings: LlmProviderSettings): LlmProvider {
  if (settings.provider === 'openai') {
    return new OpenAIProvider({apiKey: settings.apiKey});
  }

  // Exhaustive guard for future providers.
  throw new Error(`Unsupported LLM provider: ${String((settings as any).provider)}`);
}

export function withAppLanguagePolicy(baseInstruction: string, language: string): string {
  const lang = (language ?? '').toLowerCase();
  const languageDirective =
    lang === 'he'
      ? 'User app language is Hebrew. Output MUST be in natural Hebrew (RTL-friendly), including all fields and values. Do not answer in English.'
      : 'User app language is English. Output MUST be in clear English.';

  return `${baseInstruction} ${languageDirective}`.trim();
}
