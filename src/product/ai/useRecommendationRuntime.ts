import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createAiConversationLaunch,
  type AiConversationSummary,
  type AiRecommendationStart,
  type AiRecommendationFeedback,
  type AiRecommendationRequest,
  type AiLocale,
} from '../../modules/ai';
import {guardAssistantOutput} from '../../services/aiAnalyst/assistantOutputGuard';
import {
  buildRecommendationPatientContext,
  createRecommendationMemoryStore,
  type RecommendationMemory,
} from '../../services/aiRecommendations/recommendationMemory';
import {
  recommendationPrompt,
  runRecommendation,
} from '../../services/aiRecommendations/recommendationOrchestrator';
import type {AiAnalystModuleRuntime, AiAnalystSurface} from './runtime';

type Chat = Parameters<typeof runRecommendation>[0]['chat'];
export type RecommendationEvidence =
  | string
  | {
      readonly text: string;
      /** Earliest expiry of a fact explicitly used as current; omitted for historical-only evidence. */
      readonly currentFactsExpireAtMs?: number;
    };
export interface RecommendationRuntimePorts {
  readonly scopeId: string | null;
  readonly locale: AiLocale;
  readonly storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  };
  readonly chat: Chat;
  readonly loadEvidence: (
    input: AiRecommendationStart,
    signal: AbortSignal,
  ) => Promise<RecommendationEvidence>;
  readonly loadLegacyHistory?: () => Promise<readonly AiConversationSummary[]>;
}

let idSequence = 0;
const newId = () =>
  `rec-${Date.now().toString(36)}-${(++idSequence).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
const storageError = (locale: AiLocale) =>
  locale === 'he'
    ? 'לא הצלחנו לשמור או לטעון את הזיכרון. אפשר לנסות שוב.'
    : 'Memory could not be saved or loaded. Please try again.';
const runError = (locale: AiLocale, caught?: unknown) =>
  caught instanceof Error && caught.name === 'CurrentEvidenceExpiredError'
    ? locale === 'he'
      ? 'נתוני עכשיו התיישנו בזמן הכנת ההמלצה. נסו שוב כדי לקבל המלצה עם נתונים מעודכנים.'
      : 'Current data became outdated while preparing the recommendation. Try again to use updated readings.'
    : caught instanceof Error && caught.name === 'UnsafeRecommendationError'
    ? locale === 'he'
      ? 'התשובה כללה הנחיית טיפול שלא מתאימה לייעוץ כאן ולכן לא הוצגה. אפשר לנסות שוב או להתייעץ עם הצוות המטפל.'
      : 'The answer contained a treatment instruction that is not appropriate here, so it was not shown. Try again or discuss it with your care team.'
    : locale === 'he'
    ? 'לא הצלחנו להשלים את ההמלצה. בדקו את החיבור ואת הגדרות ה־AI ונסו שוב.'
    : 'The recommendation could not be completed. Check your connection and AI settings, then retry.';

const recommendationForLegacyLaunch = (
  input: Parameters<AiAnalystModuleRuntime['start']>[0],
): AiRecommendationRequest => {
  const period = input.focus?.kind === 'period' ? input.focus : undefined;
  const horizon =
    period && period.endMs - period.startMs > 7 * 86_400_000
      ? 'monthly'
      : 'weekly';
  switch (input.specialist) {
    case 'hypo-investigation':
      return {kind: 'guided', horizon, focus: 'routine', goal: 'fewer-lows'};
    case 'loop-advice':
      return {
        kind: 'guided',
        horizon,
        focus: 'care-team',
        goal: 'steadier-glucose',
      };
    case 'behavior-analysis':
      return {
        kind: 'guided',
        horizon,
        focus: 'routine',
        goal: 'easier-routine',
      };
    case 'meal-analysis':
      return {kind: 'guided', horizon, focus: 'food', goal: 'steadier-glucose'};
    case 'general-chat':
      return input.focus?.kind === 'day' || period
        ? {kind: 'guided', horizon}
        : {kind: 'now'};
  }
};

/** Makes a slow legacy evidence read cancellable, even when its API has no signal. */
const abortable = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise((resolve, reject) => {
    const cancelled = () => {
      const error = new Error('Cancelled');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal.aborted) {
      cancelled();
      return;
    }
    signal.addEventListener('abort', cancelled, {once: true});
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', cancelled));
  });

/** One recommendation experience for native and web, with legacy history kept readable. */
export function useRecommendationRuntime(
  base: AiAnalystModuleRuntime,
  ports: RecommendationRuntimePorts,
): AiAnalystModuleRuntime {
  const store = useMemo(
    () =>
      ports.scopeId === null
        ? undefined
        : createRecommendationMemoryStore({
            storage: ports.storage,
            scopeId: ports.scopeId,
          }),
    [ports.scopeId, ports.storage],
  );
  const [memory, setMemory] = useState<RecommendationMemory>();
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState<string>();
  const [surface, setSurface] = useState<AiAnalystSurface>();
  const [session, setSession] = useState<AiConversationSummary>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string>();
  const [visibleContext, setVisibleContext] = useState<string>();
  const run = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const request = useRef<AiRecommendationStart | undefined>(undefined);
  const scope = useRef(ports.scopeId);
  const scopeEpoch = useRef(0);
  if (scope.current !== ports.scopeId) {
    scopeEpoch.current += 1;
  }
  scope.current = ports.scopeId;
  const previousScope = useRef(ports.scopeId);
  const pendingTurn = useRef<
    | {
        readonly runId: number;
        readonly previous: AiConversationSummary | undefined;
        readonly pending: AiConversationSummary;
        readonly question: string;
      }
    | undefined
  >(undefined);

  const cancel = useCallback(() => {
    const pending = pendingTurn.current;
    pendingTurn.current = undefined;
    if (pending) {
      setSession(pending.previous ?? {...pending.pending, messages: []});
      setDraft(pending.previous ? pending.question : '');
    }
    run.current += 1;
    controller.current?.abort();
    controller.current = undefined;
    setBusy(false);
    setProgress('');
  }, []);

  useLayoutEffect(() => {
    if (previousScope.current === ports.scopeId) {
      return;
    }
    previousScope.current = ports.scopeId;
    run.current += 1;
    controller.current?.abort();
    controller.current = undefined;
    request.current = undefined;
    pendingTurn.current = undefined;
    setMemory(undefined);
    setMemoryBusy(false);
    setMemoryError(undefined);
    setSession(undefined);
    setSurface(undefined);
    setDraft('');
    setBusy(false);
    setProgress('');
    setError(undefined);
    setVisibleContext(undefined);
  }, [ports.scopeId]);

  useEffect(() => {
    let active = true;
    const identity = ports.scopeId;
    if (store) {
      store
        .read()
        .then(value => {
          if (active && scope.current === identity) {
            setMemory(current =>
              JSON.stringify(current) === JSON.stringify(value)
                ? current
                : value,
            );
          }
        })
        .catch(() => {
          if (active && scope.current === identity) {
            setMemoryError(storageError(ports.locale));
          }
        });
    }
    return () => {
      active = false;
    };
  }, [store, ports.scopeId, ports.locale]);

  useEffect(
    () => () => {
      run.current += 1;
      controller.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (base.snapshot.availability !== 'ready') {
      cancel();
    }
  }, [base.snapshot.availability, cancel]);

  const execute = async (
    start: AiRecommendationStart,
    question: string,
    previous?: AiConversationSummary,
  ) => {
    if (
      !store ||
      controller.current ||
      base.snapshot.availability !== 'ready'
    ) {
      return;
    }
    base.cancel();
    const identity = ports.scopeId;
    const runId = ++run.current;
    const abort = new AbortController();
    controller.current = abort;
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 180_000);
    const current = () =>
      scope.current === identity &&
      run.current === runId &&
      !abort.signal.aborted;
    request.current = start;
    const now = Date.now();
    const pending: AiConversationSummary = {
      id: previous?.id ?? newId(),
      title: previous?.title ?? question.slice(0, 80),
      specialist:
        start.request.kind === 'meal' ? 'meal-analysis' : 'general-chat',
      recommendation: start.request,
      ...(start.focus ? {recommendationFocus: start.focus} : {}),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      messages: [
        ...(previous?.messages ?? []),
        {role: 'user', content: question},
      ],
    };
    pendingTurn.current = {runId, previous, pending, question};
    setSession(pending);
    setSurface({kind: 'conversation'});
    setVisibleContext(undefined);
    setDraft('');
    setBusy(true);
    setError(undefined);
    setProgress(
      start.locale === 'he'
        ? 'מכין המלצה שמתאימה לכם…'
        : 'Preparing your recommendation…',
    );
    try {
      let patientMemory = await abortable(store.read(), abort.signal);
      if (!current()) {
        return;
      }
      if (
        patientMemory.enabled &&
        !patientMemory.historyImported &&
        ports.loadLegacyHistory
      ) {
        const legacy = await abortable(ports.loadLegacyHistory(), abort.signal);
        if (!current()) {
          return;
        }
        patientMemory = await abortable(
          store.update(value => ({
            ...value,
            historyImported: true,
            questions: value.enabled
              ? [
                  ...value.questions,
                  ...[...legacy]
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .slice(0, 8)
                    .flatMap(item =>
                      item.messages
                        .filter(message => message.role === 'user')
                        .slice(-4)
                        .map(message => ({
                          text: message.content.slice(0, 1500),
                          at: item.updatedAt,
                        })),
                    ),
                ]
              : value.questions,
          })),
          abort.signal,
        );
      }
      if (!current()) {
        return;
      }
      setMemory(patientMemory);
      const patientContext = buildRecommendationPatientContext(
        patientMemory,
        start.locale,
      );
      const loadedEvidence = await abortable(
        ports.loadEvidence(start, abort.signal),
        abort.signal,
      );
      if (!current()) {
        return;
      }
      const evidence =
        typeof loadedEvidence === 'string'
          ? loadedEvidence
          : loadedEvidence.text;
      const currentFactsExpireAtMs =
        typeof loadedEvidence === 'string'
          ? undefined
          : loadedEvidence.currentFactsExpireAtMs;
      const assertEvidenceCurrent = () => {
        if (
          currentFactsExpireAtMs !== undefined &&
          (!Number.isFinite(currentFactsExpireAtMs) ||
            Date.now() >= currentFactsExpireAtMs)
        ) {
          const expired = new Error(
            'Current evidence expired during recommendation.',
          );
          expired.name = 'CurrentEvidenceExpiredError';
          throw expired;
        }
      };
      assertEvidenceCurrent();
      const focus = createAiConversationLaunch({
        specialist: pending.specialist,
        locale: start.locale,
        ...(start.focus ? {focus: start.focus} : {}),
      }).visibleContext;
      const factualContext = [focus, evidence].filter(Boolean).join('\n\n');
      setVisibleContext(
        [factualContext, patientContext].filter(Boolean).join('\n\n'),
      );
      const answer = await runRecommendation({
        request: start.request,
        locale: start.locale,
        evidence: factualContext,
        patientContext,
        messages: pending.messages,
        chat: async (messages, signal) => {
          assertEvidenceCurrent();
          const providerAnswer = await ports.chat(messages, signal);
          assertEvidenceCurrent();
          return providerAnswer;
        },
        signal: abort.signal,
        onProgress: value => {
          if (current()) {
            setProgress(value);
          }
        },
      });
      if (!current()) {
        return;
      }
      assertEvidenceCurrent();
      const complete: AiConversationSummary = {
        ...pending,
        updatedAt: Date.now(),
        messages: [
          ...pending.messages,
          {
            role: 'assistant',
            content: guardAssistantOutput({
              text: answer,
              language: start.locale,
            }),
          },
        ],
      };
      pendingTurn.current = undefined;
      setSession(complete);
      try {
        const saved = await abortable(
          store.update(value => ({
            ...value,
            conversations: [
              complete,
              ...value.conversations.filter(item => item.id !== complete.id),
            ],
            questions: value.enabled
              ? [...value.questions, {text: question, at: Date.now()}]
              : value.questions,
          })),
          abort.signal,
        );
        if (current()) {
          setMemory(saved);
          setSession(
            saved.conversations.find(item => item.id === complete.id) ??
              complete,
          );
          setMemoryError(undefined);
        }
      } catch {
        if (current()) {
          setMemoryError(storageError(start.locale));
        }
      }
    } catch (caught) {
      if (scope.current === identity && run.current === runId) {
        setSession(previous ?? {...pending, messages: []});
        if (previous) {
          setDraft(question);
        }
        if (!abort.signal.aborted || timedOut) {
          setError(runError(start.locale, caught));
        }
      }
    } finally {
      clearTimeout(deadline);
      if (pendingTurn.current?.runId === runId) {
        pendingTurn.current = undefined;
      }
      if (controller.current === abort) {
        controller.current = undefined;
      }
      if (scope.current === identity && run.current === runId) {
        setBusy(false);
        setProgress('');
      }
    }
  };

  const mutateMemory = async (
    change: (value: RecommendationMemory) => RecommendationMemory,
  ) => {
    if (!store) {
      throw new Error('Workspace unavailable');
    }
    const identity = ports.scopeId;
    const epoch = scopeEpoch.current;
    const stillInScope = () =>
      scope.current === identity && scopeEpoch.current === epoch;
    setMemoryBusy(true);
    setMemoryError(undefined);
    try {
      const saved = await store.update(change);
      if (stillInScope()) {
        setMemory(saved);
      }
    } catch (caught) {
      if (stillInScope()) {
        setMemoryError(storageError(ports.locale));
      }
      throw caught;
    } finally {
      if (stillInScope()) {
        setMemoryBusy(false);
      }
    }
  };

  const openSavedConversation = async (
    conversationId: string,
    locale: AiLocale,
  ) => {
    cancel();
    base.cancel();
    if (!store) {
      return;
    }
    const identity = ports.scopeId;
    const epoch = scopeEpoch.current;
    const navigation = run.current;
    const current = () =>
      scope.current === identity &&
      scopeEpoch.current === epoch &&
      run.current === navigation;
    try {
      const saved = await store?.read();
      if (!current()) {
        return;
      }
      let item = saved?.conversations.find(
        value => value.id === conversationId,
      );
      if (!item) {
        const legacy = ports.loadLegacyHistory
          ? await ports.loadLegacyHistory()
          : base.snapshot.history;
        if (!current()) {
          return;
        }
        item = legacy.find(value => value.id === conversationId);
      }
      if (!item) {
        setMemoryError(storageError(locale));
        return;
      }
      const start: AiRecommendationStart = {
        request:
          item.recommendation ??
          recommendationForLegacyLaunch({
            specialist: item.specialist,
            locale,
            ...(item.recommendationFocus
              ? {focus: item.recommendationFocus}
              : {}),
          }),
        locale,
        ...(item.recommendationFocus ? {focus: item.recommendationFocus} : {}),
      };
      // Legacy transcripts remain visible as history data. Continuing them
      // uses the same reviewed recommendation path as a new conversation.
      setSession({
        ...item,
        messages: item.messages.map(message =>
          message.role === 'assistant'
            ? {
                ...message,
                content: guardAssistantOutput({
                  text: message.content,
                  language: locale,
                }),
              }
            : message,
        ),
      });
      request.current = start;
      setSurface({kind: 'conversation'});
      setDraft('');
      setVisibleContext(
        createAiConversationLaunch({
          specialist: item.specialist,
          locale,
          ...(start.focus ? {focus: start.focus} : {}),
        }).visibleContext,
      );
      setError(undefined);
      setMemoryError(undefined);
      if (saved) {
        setMemory(saved);
      }
    } catch {
      if (current()) {
        setMemoryError(storageError(locale));
      }
    }
  };

  const historyById = new Map(
    base.snapshot.history.map(item => [item.id, item]),
  );
  for (const item of memory?.conversations ?? []) {
    historyById.set(item.id, item);
  }
  const history = [...historyById.values()].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  const messageFeedback: Record<number, AiRecommendationFeedback> = {};
  for (const feedback of memory?.feedback ?? []) {
    if (feedback.conversationId === session?.id) {
      messageFeedback[feedback.messageIndex] = feedback;
    }
  }
  const ownConversation =
    surface?.kind === 'conversation' && session !== undefined;
  const selectionAtRender = {
    session,
    request: request.current,
    surfaceKind: surface?.kind,
    epoch: scopeEpoch.current,
    navigation: run.current,
  };
  const currentSelection = useRef(selectionAtRender);
  currentSelection.current = selectionAtRender;
  const ownSnapshot = surface
    ? {
        surface,
        ...(ownConversation
          ? {
              activeSpecialist: session.specialist,
              messages: session.messages,
              visibleContext,
              draft,
              busy,
              progress,
              error,
            }
          : {}),
      }
    : {};

  return {
    ...base,
    snapshot: {
      ...base.snapshot,
      ...ownSnapshot,
      history,
      messageFeedback,
      recommendationContextKey: JSON.stringify([
        ports.scopeId,
        scopeEpoch.current,
        session?.id,
        surface?.kind,
      ]),
      ...(memory
        ? {
            patientMemory: {
              enabled: memory.enabled,
              instructions: memory.instructions,
              feedbackCount: memory.feedback.length,
              questionCount: memory.questions.length,
            },
          }
        : {}),
      memoryBusy,
      ...(memoryError ? {memoryError} : {}),
    },
    startRecommendation: async start =>
      execute(start, recommendationPrompt(start.request, start.locale)),
    start: async input => {
      if (input.focus?.kind === 'ai-conversation') {
        await openSavedConversation(input.focus.conversationId, input.locale);
        return;
      }
      cancel();
      const start: AiRecommendationStart = {
        request: recommendationForLegacyLaunch(input),
        locale: input.locale,
        ...(input.focus ? {focus: input.focus} : {}),
      };
      await execute(start, recommendationPrompt(start.request, start.locale));
    },
    setDraft: value =>
      ownConversation ? setDraft(value) : base.setDraft(value),
    send: async () => {
      if (!ownConversation) {
        return;
      }
      if (draft.trim() && request.current) {
        await execute(request.current, draft.trim(), session);
      }
    },
    retry: async () => {
      if (!ownConversation || !request.current) {
        return;
      }
      if (draft.trim()) {
        await execute(request.current, draft.trim(), session);
      } else {
        await execute(
          request.current,
          recommendationPrompt(request.current.request, request.current.locale),
        );
      }
    },
    cancel: () => {
      cancel();
      base.cancel();
    },
    openLanding: () => {
      cancel();
      setSurface(undefined);
      setSession(undefined);
      setDraft('');
      setError(undefined);
      request.current = undefined;
      base.openLanding();
    },
    openHistory: async () => {
      cancel();
      const identity = ports.scopeId;
      const navigation = run.current;
      try {
        const saved = await store?.read();
        if (scope.current !== identity || navigation !== run.current) {
          return;
        }
        if (saved) {
          setMemory(saved);
        }
        await base.openHistory();
        if (scope.current === identity && navigation === run.current) {
          setSurface({kind: 'history'});
        }
      } catch {
        if (scope.current === identity) {
          setMemoryError(storageError(ports.locale));
        }
      }
    },
    openHistoryDetail: conversationId => {
      cancel();
      setSurface({kind: 'history-detail', conversationId});
    },
    resumeConversation: conversationId =>
      openSavedConversation(conversationId, ports.locale),
    deleteConversation: async conversationId => {
      cancel();
      const identity = ports.scopeId;
      const navigation = run.current;
      const saved = await store?.read();
      if (scope.current !== identity || navigation !== run.current) {
        return;
      }
      if (saved?.conversations.some(item => item.id === conversationId)) {
        await mutateMemory(value => ({
          ...value,
          conversations: value.conversations.filter(
            item => item.id !== conversationId,
          ),
          feedback: value.feedback.filter(
            item => item.conversationId !== conversationId,
          ),
        }));
      }
      // A continued legacy thread can exist in both stores under the same ID.
      if (scope.current === identity && navigation === run.current) {
        await base.deleteConversation(conversationId);
      }
      if (scope.current === identity && navigation === run.current) {
        setSurface({kind: 'history'});
      }
    },
    clearHistory: async () => {
      cancel();
      const navigation = run.current;
      await mutateMemory(value => ({
        ...value,
        conversations: [],
        questions: [],
        feedback: [],
        historyImported: true,
      }));
      if (navigation === run.current) {
        await base.clearHistory();
      }
    },
    reviseFromFeedback: async messageIndex => {
      // A UI save may finish after navigation and invoke an older callback.
      // Match its rendered answer and request before reading or starting work.
      const selectionIsCurrent = () =>
        currentSelection.current.session === selectionAtRender.session &&
        currentSelection.current.request === selectionAtRender.request &&
        currentSelection.current.surfaceKind ===
          selectionAtRender.surfaceKind &&
        request.current === selectionAtRender.request &&
        run.current === selectionAtRender.navigation &&
        scopeEpoch.current === selectionAtRender.epoch &&
        scope.current === ports.scopeId;
      if (
        !selectionIsCurrent() ||
        !ownConversation ||
        !session ||
        busy ||
        controller.current ||
        !store ||
        !request.current
      ) {
        return;
      }
      const selected = session.messages[messageIndex];
      if (selected?.role !== 'assistant') {
        return;
      }
      const identity = ports.scopeId;
      const epoch = scopeEpoch.current;
      const start = request.current;
      let saved: RecommendationMemory;
      try {
        saved = await store.read();
      } catch {
        if (scope.current === identity && scopeEpoch.current === epoch) {
          setMemoryError(storageError(ports.locale));
        }
        return;
      }
      if (!selectionIsCurrent() || controller.current) {
        return;
      }
      const feedback = saved.feedback.find(
        item =>
          item.conversationId === session.id &&
          item.messageIndex === messageIndex &&
          item.rating === 'not-helpful',
      );
      if (
        !feedback ||
        (!feedback.comment?.trim() && feedback.reasons.length === 0) ||
        !selected.content.startsWith(feedback.answerExcerpt)
      ) {
        return;
      }
      const he = start.locale === 'he';
      const reasonLabels: Record<string, string> = he
        ? {
            'too-long': 'ארוך מדי',
            'not-relevant': 'לא מתאים לי',
            'hard-to-do': 'קשה ליישום',
            'too-hard': 'קשה ליישום',
            'hard-to-follow': 'קשה ליישום',
            'already-tried': 'כבר ניסיתי את זה',
            unclear: 'לא ברור',
          }
        : {
            'too-long': 'too long',
            'not-relevant': 'not relevant to me',
            'hard-to-do': 'hard to put into practice',
            'too-hard': 'hard to put into practice',
            'hard-to-follow': 'hard to put into practice',
            'already-tried': 'I have already tried this',
            unclear: 'unclear',
          };
      const question = [
        he
          ? 'התאם את התשובה הזו להעדפות שלי, תוך שמירה על אותה תקופה והקשר.'
          : 'Adapt this answer to my preferences, keeping the same period and context.',
        `${
          he
            ? 'התשובה שאליה מתייחס המשוב'
            : 'The answer this feedback refers to'
        }: ${JSON.stringify(feedback.answerExcerpt)}`,
        feedback.reasons.length
          ? `${
              he ? 'מה פחות התאים לי' : 'What did not suit me'
            }: ${feedback.reasons
              .map(reason => reasonLabels[reason] ?? reason)
              .join(', ')}`
          : '',
        feedback.comment
          ? `${he ? 'ההערה שלי' : 'My comment'}: ${feedback.comment}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
      await execute(start, question, session);
    },
    saveFeedback: ownConversation
      ? async feedback => {
          const message = session?.messages[feedback.messageIndex];
          if (!session || message?.role !== 'assistant' || busy) {
            throw new Error('Recommendation unavailable');
          }
          const question =
            session.messages
              .slice(0, feedback.messageIndex)
              .filter(item => item.role === 'user')
              .pop()?.content ?? '';
          await mutateMemory(value => ({
            ...value,
            feedback: [
              ...value.feedback.filter(
                item =>
                  !(
                    item.conversationId === session.id &&
                    item.messageIndex === feedback.messageIndex
                  ),
              ),
              {
                conversationId: session.id,
                ...feedback,
                question,
                answerExcerpt: message.content.slice(0, 700),
                at: Date.now(),
              },
            ],
          }));
        }
      : undefined,
    savePatientMemory: async value => {
      cancel();
      await mutateMemory(current => ({...current, ...value}));
    },
    clearPatientMemory: async () => {
      cancel();
      await mutateMemory(current => ({
        ...current,
        instructions: '',
        questions: [],
        feedback: [],
        historyImported: true,
      }));
    },
    // Meal images remain available in older conversations. New meal requests
    // use explicit size/notes; never upload an image as a side effect of a tap.
    ...(ownConversation ? {attachMealImage: undefined} : {}),
  };
}
