import {LlmProvider} from './llmTypes';

export type PagingChunk = {
  page: number;
  has_more: boolean;
  chunk: string;
};

export type CollectPagedTextParams = {
  provider: LlmProvider;
  model: string;
  baseSystemInstruction: string;
  payload: unknown;
  maxPages?: number;
  maxOutputTokensPerPage?: number;
  maxAttemptsPerPage?: number;
  pageCharTarget?: number;
  temperature?: number;
};

export type CollectPagedTextResult = {
  text: string;
  pagesUsed: number;
  truncated: boolean;
  traces: Array<{
    page: number;
    attempt: number;
    maxOutputTokens: number;
    pageCharTarget: number;
    ok: boolean;
    error?: string;
  }>;
};

function parseChunk(raw: string): PagingChunk | null {
  const trimmed = raw.trim();
  const parseTry = (s: string) => {
    try {
      return JSON.parse(s) as PagingChunk;
    } catch {
      return null;
    }
  };

  let parsed = parseTry(trimmed);
  if (!parsed) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      parsed = parseTry(trimmed.slice(start, end + 1));
    }
  }
  if (!parsed) {
    return null;
  }

  if (typeof parsed.page !== 'number' || typeof parsed.has_more !== 'boolean' || typeof parsed.chunk !== 'string') {
    return null;
  }

  return parsed;
}

function isLengthLikeError(err: any): boolean {
  const msg = String(err?.message ?? err ?? '').toLowerCase();
  return msg.includes('finish_reason=length') || msg.includes('not complete') || msg.includes('max tokens');
}

function buildSystemInstruction(base: string, pageCharTarget: number): string {
  return [
    base,
    'Paging protocol (strict): return JSON only with exactly these keys: page, has_more, chunk.',
    'chunk must contain ONLY the next segment of content with no overlap/repetition.',
    `Keep chunk around ${pageCharTarget} chars (or less if page is complete).`,
    'Never wrap JSON in markdown fences.',
  ].join(' ');
}

export async function collectPagedTextFromLlm(
  params: CollectPagedTextParams,
): Promise<CollectPagedTextResult> {
  const maxPages = Math.max(1, Math.min(20, Math.round(params.maxPages ?? 6)));
  const initialPageCharTarget = Math.max(200, Math.min(4000, Math.round(params.pageCharTarget ?? 1200)));
  const baseMaxTokens = Math.max(100, Math.round(params.maxOutputTokensPerPage ?? 1000));
  const maxAttemptsPerPage = Math.max(1, Math.min(6, Math.round(params.maxAttemptsPerPage ?? 3)));

  let assembled = '';
  let hasMore = true;
  const traces: CollectPagedTextResult['traces'] = [];
  let pagesUsed = 0;

  for (let page = 1; page <= maxPages && hasMore; page += 1) {
    let pageDone = false;
    let localTokens = baseMaxTokens;
    let localPageCharTarget = initialPageCharTarget;

    for (let attempt = 1; attempt <= maxAttemptsPerPage; attempt += 1) {
      try {
        const res = await params.provider.sendChat({
          model: params.model,
          messages: [
            {role: 'system', content: buildSystemInstruction(params.baseSystemInstruction, localPageCharTarget)},
            {
              role: 'user',
              content: JSON.stringify({
                protocol: {
                  current_page: page,
                  max_pages: maxPages,
                  already_collected_chars: assembled.length,
                  tail_preview: assembled.slice(-500),
                },
                payload: params.payload,
              }),
            },
          ],
          temperature: params.temperature ?? 0.2,
          maxOutputTokens: localTokens,
        });

        const parsed = parseChunk(String(res?.content ?? ''));
        if (!parsed) {
          traces.push({
            page,
            attempt,
            maxOutputTokens: localTokens,
            pageCharTarget: localPageCharTarget,
            ok: false,
            error: 'invalid_json_chunk',
          });
          continue;
        }

        const chunk = String(parsed.chunk ?? '');
        if (!chunk.trim()) {
          traces.push({
            page,
            attempt,
            maxOutputTokens: localTokens,
            pageCharTarget: localPageCharTarget,
            ok: false,
            error: 'empty_chunk',
          });
          continue;
        }

        // Tolerate wrong page value (models sometimes drift), but keep trace.
        if (chunk) {
          const last = assembled.slice(-chunk.length);
          if (last !== chunk) {
            assembled += chunk;
          }
        }
        hasMore = parsed.has_more;
        pagesUsed = page;
        traces.push({
          page,
          attempt,
          maxOutputTokens: localTokens,
          pageCharTarget: localPageCharTarget,
          ok: true,
        });
        pageDone = true;
        break;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        traces.push({
          page,
          attempt,
          maxOutputTokens: localTokens,
          pageCharTarget: localPageCharTarget,
          ok: false,
          error: msg,
        });

        if (isLengthLikeError(e)) {
          localTokens = Math.min(3200, Math.round(localTokens * 1.5));
          localPageCharTarget = Math.max(220, Math.round(localPageCharTarget * 0.8));
          continue;
        }

        // Non-length errors: retry same page within attempt budget.
      }
    }

    if (!pageDone) {
      const err = new Error(`Paging failed at page ${page}`) as Error & {pagingTraces?: CollectPagedTextResult['traces']};
      err.pagingTraces = traces;
      throw err;
    }
  }

  return {
    text: assembled,
    pagesUsed,
    truncated: hasMore,
    traces,
  };
}
