export type LlmRole = 'system' | 'user' | 'assistant';

export type LlmChatMessage = {
  role: LlmRole;
  content: string;
};

export type LlmChatRequest = {
  model: string;
  messages: LlmChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
};

export type LlmChatResponse = {
  content: string;
  raw?: unknown;
};

export type LlmProvider = {
  sendChat: (req: LlmChatRequest) => Promise<LlmChatResponse>;
};
