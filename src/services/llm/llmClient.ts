import {LlmProvider} from './llmTypes';
import {OpenAIProvider} from './providers/openaiProvider';
import {AiSettings} from 'app/contexts/AiSettingsContext';

export function createLlmProvider(settings: AiSettings): LlmProvider {
  if (settings.provider === 'openai') {
    return new OpenAIProvider({apiKey: settings.apiKey});
  }

  // Exhaustive guard for future providers.
  throw new Error(`Unsupported LLM provider: ${String((settings as any).provider)}`);
}
