import {LlmChatMessage} from 'app/services/llm/llmTypes';

export type AiAnalystDataUsedItem = {
  name: string;
  atIso: string;
  result: any;
};

export interface AiAnalystExportPayload {
  version: 1;
  exportedAtIso: string;
  conversationId: string | null;
  mission: string | null;
  transcript: Array<{role: 'user' | 'assistant'; content: string}>;
  dataUsed: AiAnalystDataUsedItem[];
}

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

export function buildAiAnalystExportPayload(params: {
  conversationId: string | null;
  mission: string | null;
  messages: LlmChatMessage[];
  dataUsed: AiAnalystDataUsedItem[];
}): AiAnalystExportPayload {
  const transcript = (params.messages ?? [])
    .filter((m): m is LlmChatMessage & {role: 'user' | 'assistant'} => {
      return m.role === 'user' || m.role === 'assistant';
    })
    .map(m => ({role: m.role, content: safeString(m.content)}));

  return {
    version: 1,
    exportedAtIso: new Date().toISOString(),
    conversationId: params.conversationId ?? null,
    mission: params.mission ?? null,
    transcript,
    dataUsed: params.dataUsed ?? [],
  };
}

export function buildAiAnalystExportMarkdown(payload: AiAnalystExportPayload): string {
  const title = payload.mission ? `AI Analyst – ${payload.mission}` : 'AI Analyst';
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- Exported: ${payload.exportedAtIso}`);
  if (payload.conversationId) lines.push(`- Conversation ID: ${payload.conversationId}`);
  lines.push('');

  lines.push('## Conversation');
  lines.push('');
  for (const m of payload.transcript) {
    const who = m.role === 'user' ? 'User' : 'Assistant';
    lines.push(`### ${who}`);
    lines.push('');
    lines.push(safeString(m.content).trim());
    lines.push('');
  }

  lines.push('## Diabetes Data Used (from app tools)');
  lines.push('');
  lines.push('This section contains the data pulled from the app during this discussion. It does not include internal tool-call logs.');
  lines.push('');

  if (!payload.dataUsed.length) {
    lines.push('_No tool data was recorded for this session._');
    lines.push('');
    return lines.join('\n');
  }

  payload.dataUsed.forEach((item, idx) => {
    lines.push(`### ${idx + 1}. ${item.name}`);
    lines.push('');
    lines.push(`Pulled: ${item.atIso}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(item.result ?? null, null, 2));
    lines.push('```');
    lines.push('');
  });

  return lines.join('\n');
}

export function buildAiAnalystExportJson(payload: AiAnalystExportPayload): string {
  return JSON.stringify(payload, null, 2);
}
