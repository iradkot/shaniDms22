import {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  createAiConversationLaunch,
  getAiSpecialistDefinition,
  type AiConversationMessage,
  type AiConversationSummary,
  type AiLocale,
  type AiSpecialistId,
} from '../../../modules/ai';
import type {
  AiAnalystModuleRuntime,
  AiAnalystSurface,
} from '../../../product/ai';
import {guardAssistantOutput} from '../../../services/aiAnalyst/assistantOutputGuard';
import type {IndexedDbKeyValueStore} from '../storage';
import {createOpaqueBrowserId} from '../identity';
import {BrowserAiService, browserAiMessages} from './browserAiService';
import type {BrowserAiEvidenceProvider} from './browserAiEvidenceProvider';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeHistory = (
  raw: string | null,
): readonly AiConversationSummary[] => {
  if (raw === null) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.items)
    ) {
      return [];
    }
    return value.items
      .flatMap(item => {
        if (
          !isRecord(item) ||
          typeof item.id !== 'string' ||
          item.id.length > 160 ||
          typeof item.title !== 'string' ||
          item.title.length > 160 ||
          ![
            'general-chat',
            'hypo-investigation',
            'behavior-analysis',
            'meal-analysis',
            'loop-advice',
          ].includes(String(item.specialist)) ||
          !Number.isSafeInteger(item.createdAt) ||
          !Number.isSafeInteger(item.updatedAt) ||
          !Array.isArray(item.messages) ||
          item.messages.length > 200
        ) {
          return [];
        }
        const messages: AiConversationMessage[] = item.messages.flatMap(
          message =>
            isRecord(message) &&
            (message.role === 'user' || message.role === 'assistant') &&
            typeof message.content === 'string' &&
            message.content.length > 0 &&
            message.content.length <= 200_000
              ? [{role: message.role, content: message.content}]
              : [],
        );
        if (messages.length !== item.messages.length) {
          return [];
        }
        return [
          {
            id: item.id,
            title: item.title,
            specialist: item.specialist as AiSpecialistId,
            createdAt: item.createdAt as number,
            updatedAt: item.updatedAt as number,
            messages,
          },
        ];
      })
      .slice(0, 100);
  } catch {
    return [];
  }
};

const systemInstruction = (
  locale: AiLocale,
  specialist: AiSpecialistId,
): string => {
  const label = getAiSpecialistDefinition(specialist).copy[locale].title;
  return locale === 'he'
    ? `אתה מסייע מידע בתחום הסוכרת במצב ${label}. הסבר עובדות ואי-ודאות בפשטות. אל תשנה מינונים, טיפול, Loop או Nightscout. כל הצעת שינוי היא לדיון עם הצוות המטפל בלבד. אל תמציא נתונים שלא נמסרו.`
    : `You are an informational diabetes assistant in ${label} mode. Explain facts and uncertainty plainly. Never change doses, therapy, Loop, or Nightscout. Any change suggestion is for discussion with the care team only. Do not invent missing data.`;
};

type StartInput = Parameters<AiAnalystModuleRuntime['start']>[0];

export const useBrowserAiAnalystRuntime = (input: {
  readonly service: BrowserAiService;
  readonly storage: Pick<IndexedDbKeyValueStore, 'getItem' | 'setItem'>;
  readonly scopeId: string;
  readonly locale: AiLocale;
  readonly enabled: boolean;
  readonly credentialConfigured: boolean;
  readonly evidenceProvider?: BrowserAiEvidenceProvider;
  readonly onOpenSettings: () => void;
}): AiAnalystModuleRuntime => {
  const historyKey = `shani.web.ai-history.v1:${input.scopeId}`;
  const [surface, setSurface] = useState<AiAnalystSurface>({kind: 'landing'});
  const [activeSpecialist, setActiveSpecialist] =
    useState<AiSpecialistId>('general-chat');
  const [visibleContext, setVisibleContext] = useState<string | undefined>(
    undefined,
  );
  const [messages, setMessages] = useState<readonly AiConversationMessage[]>(
    [],
  );
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<readonly AiConversationSummary[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const activeConversation = useRef<string | undefined>(undefined);
  const lastStart = useRef<StartInput | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const previousScope = useRef(input.scopeId);

  useLayoutEffect(() => {
    if (previousScope.current === input.scopeId) {
      return;
    }
    previousScope.current = input.scopeId;
    abort.current?.abort();
    abort.current = undefined;
    activeConversation.current = undefined;
    lastStart.current = undefined;
    setSurface({kind: 'landing'});
    setActiveSpecialist('general-chat');
    setVisibleContext(undefined);
    setMessages([]);
    setDraft('');
    setBusy(false);
    setProgress('');
    setError(undefined);
    setHistory([]);
    setHistoryBusy(false);
  }, [input.scopeId]);

  const storeHistory = useCallback(
    async (items: readonly AiConversationSummary[]) => {
      const requestScope = input.scopeId;
      const sorted = [...items]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 100);
      await input.storage.setItem(
        historyKey,
        JSON.stringify({schemaVersion: 1, items: sorted}),
      );
      if (previousScope.current === requestScope) {
        setHistory(sorted);
      }
    },
    [historyKey, input.scopeId, input.storage],
  );

  const loadHistory = useCallback(async () => {
    const requestScope = input.scopeId;
    setHistoryBusy(true);
    try {
      const decoded = decodeHistory(await input.storage.getItem(historyKey));
      if (previousScope.current !== requestScope) {
        return [];
      }
      setHistory(decoded);
      return decoded;
    } finally {
      if (previousScope.current === requestScope) {
        setHistoryBusy(false);
      }
    }
  }, [historyKey, input.scopeId, input.storage]);

  const start = useCallback(
    async (request: StartInput) => {
      const requestScope = input.scopeId;
      lastStart.current = request;
      const launch = createAiConversationLaunch(request);
      setActiveSpecialist(request.specialist);
      setVisibleContext(launch.visibleContext);
      setError(undefined);
      const focus = request.focus;
      if (focus?.kind === 'ai-conversation') {
        const items = await loadHistory();
        if (previousScope.current !== requestScope) {
          return;
        }
        const selected = items.find(item => item.id === focus.conversationId);
        if (selected) {
          activeConversation.current = selected.id;
          setActiveSpecialist(selected.specialist);
          setMessages(selected.messages);
        }
      } else {
        activeConversation.current = undefined;
        setMessages([]);
      }
      setSurface({kind: 'conversation'});
    },
    [input.scopeId, loadHistory],
  );

  const send = useCallback(async () => {
    const question = draft.trim();
    if (!question || busy || !input.enabled || !input.credentialConfigured) {
      return;
    }
    const userMessage: AiConversationMessage = {
      role: 'user',
      content: question,
    };
    const pending = [...messages, userMessage];
    setMessages(pending);
    setDraft('');
    setBusy(true);
    setProgress(input.locale === 'he' ? 'חושב…' : 'Thinking…');
    setError(undefined);
    const controller = new AbortController();
    const requestScope = input.scopeId;
    abort.current?.abort();
    abort.current = controller;
    try {
      let requestVisibleContext = visibleContext;
      if (input.evidenceProvider) {
        setProgress(
          input.locale === 'he' ? 'טוען נתונים…' : 'Loading evidence…',
        );
        const factualContext = await input.evidenceProvider.loadVisibleContext({
          specialist: activeSpecialist,
          locale: input.locale,
          ...(lastStart.current?.focus === undefined
            ? {}
            : {focus: lastStart.current.focus}),
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          previousScope.current !== requestScope
        ) {
          return;
        }
        requestVisibleContext = [visibleContext, factualContext]
          .filter((value): value is string => Boolean(value?.trim()))
          .join('\n');
        setVisibleContext(requestVisibleContext);
        setProgress(input.locale === 'he' ? 'חושב…' : 'Thinking…');
      }
      const answer = await input.service.chat(
        browserAiMessages(systemInstruction(input.locale, activeSpecialist), [
          ...(requestVisibleContext
            ? [
                {
                  role: 'user' as const,
                  content: `Visible context: ${requestVisibleContext}`,
                },
              ]
            : []),
          ...pending,
        ]),
        controller.signal,
      );
      if (controller.signal.aborted || previousScope.current !== requestScope) {
        return;
      }
      const next = [
        ...pending,
        {
          role: 'assistant' as const,
          content: guardAssistantOutput({text: answer, language: input.locale}),
        },
      ];
      setMessages(next);
      const now = Date.now();
      const id =
        activeConversation.current ?? `conversation-${createOpaqueBrowserId()}`;
      activeConversation.current = id;
      const items = await loadHistory();
      if (previousScope.current !== requestScope) {
        return;
      }
      const existing = items.find(item => item.id === id);
      const summary: AiConversationSummary = {
        id,
        specialist: activeSpecialist,
        title: question.slice(0, 80),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        messages: next,
      };
      await storeHistory([summary, ...items.filter(item => item.id !== id)]);
    } catch (caught) {
      if (previousScope.current === requestScope) {
        // Keep an unfinished question available so Retry can repeat the exact
        // request without duplicating the optimistic user message.
        setMessages(messages);
        setDraft(current => (current.trim() ? current : question));
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error ? caught.message : 'AI request failed.',
          );
        }
      }
    } finally {
      if (abort.current === controller) {
        abort.current = undefined;
      }
      if (previousScope.current === requestScope) {
        setBusy(false);
        setProgress('');
      }
    }
  }, [
    activeSpecialist,
    busy,
    draft,
    input,
    loadHistory,
    messages,
    storeHistory,
    visibleContext,
  ]);

  const attachMealImage = useCallback(async () => {
    if (
      typeof document === 'undefined' ||
      !input.enabled ||
      !input.credentialConfigured
    ) {
      return;
    }
    const requestScope = input.scopeId;
    const file = await new Promise<File | undefined>(resolve => {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/jpeg,image/png,image/webp';
      picker.onchange = () => resolve(picker.files?.[0]);
      picker.click();
    });
    if (
      !file ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 6_000_000
    ) {
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Image could not be read.'));
      reader.onerror = () =>
        reject(reader.error ?? new Error('Image could not be read.'));
      reader.readAsDataURL(file);
    });
    if (previousScope.current !== requestScope) {
      return;
    }
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const answer = await input.service.analyzeMealImage({
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        base64,
        instruction:
          input.locale === 'he'
            ? 'תאר מה נראה בתמונה והצע הערכת פחמימות כטווח עם אי-ודאות. אל תציע מינון.'
            : 'Describe the visible meal and estimate carbohydrates as an uncertainty range. Do not suggest a dose.',
        signal: controller.signal,
      });
      if (controller.signal.aborted || previousScope.current !== requestScope) {
        return;
      }
      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: guardAssistantOutput({text: answer, language: input.locale}),
        },
      ]);
    } catch (caught) {
      if (
        !controller.signal.aborted &&
        previousScope.current === requestScope
      ) {
        setError(
          caught instanceof Error ? caught.message : 'AI image request failed.',
        );
      }
    } finally {
      if (abort.current === controller) {
        abort.current = undefined;
      }
      if (previousScope.current === requestScope) {
        setBusy(false);
      }
    }
  }, [
    input.credentialConfigured,
    input.enabled,
    input.locale,
    input.scopeId,
    input.service,
  ]);

  return useMemo(
    () => ({
      snapshot: {
        availability: !input.enabled
          ? ('disabled' as const)
          : input.credentialConfigured
          ? ('ready' as const)
          : ('missing-credentials' as const),
        surface,
        activeSpecialist,
        visibleContext,
        messages,
        draft,
        busy,
        progress,
        error,
        history,
        historyBusy,
      },
      setDraft,
      start,
      send,
      retry: async () => {
        if (draft.trim()) {
          await send();
        } else if (lastStart.current) {
          await start(lastStart.current);
        }
      },
      cancel: () => abort.current?.abort(),
      openLanding: () => setSurface({kind: 'landing'}),
      openHistory: async () => {
        await loadHistory();
        setSurface({kind: 'history'});
      },
      openHistoryDetail: conversationId =>
        setSurface({kind: 'history-detail', conversationId}),
      resumeConversation: async conversationId => {
        const selected = (await loadHistory()).find(
          item => item.id === conversationId,
        );
        if (!selected) {
          throw new Error('Conversation was not found.');
        }
        activeConversation.current = selected.id;
        setActiveSpecialist(selected.specialist);
        setMessages(selected.messages);
        setSurface({kind: 'conversation'});
      },
      deleteConversation: async conversationId => {
        await storeHistory(
          (await loadHistory()).filter(item => item.id !== conversationId),
        );
        setSurface({kind: 'history'});
      },
      clearHistory: async () => storeHistory([]),
      openSettings: input.onOpenSettings,
      attachMealImage,
    }),
    [
      activeSpecialist,
      attachMealImage,
      busy,
      draft,
      error,
      history,
      historyBusy,
      input.credentialConfigured,
      input.enabled,
      input.onOpenSettings,
      loadHistory,
      messages,
      progress,
      send,
      start,
      storeHistory,
      surface,
      visibleContext,
    ],
  );
};
