export type AssistantOutputLanguage = 'en' | 'he';

export interface GuardAssistantOutputInput {
  text: string;
  language: AssistantOutputLanguage;
}

const RAW_SAMPLE_RUN_LENGTH = 12;

const RAW_SAMPLE_LINE_PATTERNS = [
  /^\s*(?:[-*]\s*)?(?:mg\/?dl|mgdl|sgv|glucose|timestamp|date|string|direction)\s*[:=]/i,
  /^\s*[{[]?\s*["']?(?:mg\/?dl|mgdl|sgv|glucose|timestamp|date|string|direction)["']?\s*:/i,
];

function isRawSampleLine(line: string): boolean {
  return RAW_SAMPLE_LINE_PATTERNS.some(pattern => pattern.test(line));
}

function rawOutputRemovedNote(language: AssistantOutputLanguage): string {
  return language === 'he'
    ? 'הסרתי פלט RAW ארוך כדי לשמור על התשובה קריאה.'
    : 'I removed a long RAW data dump to keep the answer readable.';
}

/**
 * Applies presentation-only output limits without rewriting the assistant's
 * clinical meaning or claiming that data was available.
 */
export function guardAssistantOutput({
  text,
  language,
}: GuardAssistantOutputInput): string {
  if (!text) {
    return text;
  }

  const lines = text.split(/\r?\n/);
  const guarded: string[] = [];
  let removedRawRun = false;

  for (let index = 0; index < lines.length; ) {
    if (!isRawSampleLine(lines[index] ?? '')) {
      guarded.push(lines[index] ?? '');
      index += 1;
      continue;
    }

    let end = index;
    while (end < lines.length && isRawSampleLine(lines[end] ?? '')) {
      end += 1;
    }

    if (end - index >= RAW_SAMPLE_RUN_LENGTH) {
      removedRawRun = true;
    } else {
      guarded.push(...lines.slice(index, end));
    }
    index = end;
  }

  if (!removedRawRun) {
    return text;
  }

  const body = guarded.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return [body, rawOutputRemovedNote(language)].filter(Boolean).join('\n\n');
}
