import type {
  AiConversationFocus,
  AiLocale,
  AiSpecialistId,
} from '../../../modules/ai';
import type {
  BrowserNightscoutDeviceStatus,
  BrowserNightscoutEntry,
  BrowserNightscoutRange,
  BrowserNightscoutTreatment,
} from '../nightscout';
import {
  decodeBrowserNightscoutTreatment,
  treatmentTimestampMs,
} from '../nightscout';
import {buildRecordedInsulinSummary} from '../../../services/insulin/recordedInsulin';
import {getLocalDayPeriod} from '../../../modules/dailyOverview';
import type {CurrentDataSource, CurrentObservation, CurrentDataSnapshot} from '../../../modules/currentData';
import {reobserveCurrentData, currentFactsExpireAtMs} from '../../../modules/currentData';
import {createBrowserCurrentDataSource} from '../nightscout/browserCurrentDataSource';

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_RANGE_MS = 14 * DAY_MS;
const MAX_CONTEXT_CHARS = 8_000;
const MAX_TREATMENTS = 24;

export interface BrowserAiEvidenceRequest {
  readonly rangeDays?: 1 | 7 | 30;
  readonly specialist: AiSpecialistId;
  readonly locale: AiLocale;
  readonly focus?: AiConversationFocus;
  readonly signal: AbortSignal;
}

export interface BrowserAiEvidenceProvider {
  loadVisibleContext(request: BrowserAiEvidenceRequest): Promise<string>;
  loadEvidence?(request: BrowserAiEvidenceRequest): Promise<BrowserAiEvidenceBundle>;
  /** The provider belongs to one source revision, including while a model call is pending. */
  assertCurrentSource?(): void;
}

export interface BrowserAiEvidenceBundle {
  readonly text: string;
  readonly currentFactsExpireAtMs?: number;
}

interface EvidenceClient {
  readonly assertCurrentSource?: () => void;
  readEntries(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutEntry>>;
  readRecordedTreatments(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<Record<string, unknown>>>;
  readDeviceStatuses(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutDeviceStatus>>;
}

const requestedPeriod = (
  request: BrowserAiEvidenceRequest,
  nowMs: number,
): {
  readonly startMs: number;
  readonly endMs: number;
  readonly clamped: boolean;
} => {
  const focus = request.focus;
  const maxRangeMs =
    request.rangeDays === undefined ? MAX_RANGE_MS : request.rangeDays * DAY_MS;
  let requestedStart = nowMs - maxRangeMs;
  let requestedEnd = nowMs;
  if (focus?.kind === 'day' && Number.isSafeInteger(focus.dayStartMs)) {
    requestedStart = focus.dayStartMs;
    requestedEnd = Math.min(nowMs, getLocalDayPeriod(focus.dayStartMs).endMs);
  } else if (
    focus?.kind === 'period' &&
    Number.isSafeInteger(focus.startMs) &&
    Number.isSafeInteger(focus.endMs) &&
    focus.endMs > focus.startMs
  ) {
    requestedStart = focus.startMs;
    requestedEnd = Math.min(nowMs, focus.endMs);
  }
  const endMs = Math.max(1, Math.min(nowMs, requestedEnd));
  const startMs = Math.max(0, requestedStart, endMs - maxRangeMs);
  return {
    startMs: Math.min(startMs, endMs - 1),
    endMs,
    clamped: startMs > requestedStart || requestedEnd > nowMs,
  };
};

const formatNumber = (value: number, maximumFractionDigits = 1): string =>
  new Intl.NumberFormat('en-US', {maximumFractionDigits}).format(value);

const currentFacts = (current: CurrentDataSnapshot, locale: AiLocale): readonly string[] => {
  const he = locale === 'he';
  const fact = (label: string, unit: string, observation: CurrentObservation, showStaleValue = false): string => {
    const status = observation.status === 'fresh' ? (he ? 'עדכני' : 'fresh')
      : observation.status === 'stale' ? (he ? 'ישן; אינו מעיד על המצב עכשיו' : 'stale; does not establish the current state')
      : (he ? 'לא זמין' : 'unavailable');
    const value = observation.status === 'fresh' || showStaleValue ? observation.value : null;
    return [
      `${label}: ${value === null ? status : `${formatNumber(value, 2)} ${unit}; ${status}`}`,
      observation.sourceTimestampMs === null ? undefined : `${he ? 'זמן המדידה' : 'source timestamp'} ${new Date(observation.sourceTimestampMs).toISOString()}`,
      observation.ageMs === null ? undefined : `${he ? 'גיל בדקות' : 'age minutes'} ${formatNumber(observation.ageMs / 60_000)}`,
      observation.fetchedAtMs === null ? undefined : `${he ? 'זמן האחזור' : 'fetched at'} ${new Date(observation.fetchedAtMs).toISOString()}`,
    ].filter(Boolean).join('; ') + '.';
  };
  return [
    he ? 'נתונים נוכחיים — נטענו בנפרד מההיסטוריה' : 'Current observations — loaded independently of history',
    fact(he ? 'סוכר נוכחי' : 'Current glucose', 'mg/dL', current.glucose, true),
    ...(current.glucose.status === 'fresh' && current.glucoseReading?.direction
      ? [`${he ? 'מגמה נוכחית' : 'Current trend'}: ${current.glucoseReading.direction}.`] : []),
    fact('IOB', 'U', current.iob),
    fact('COB', 'g', current.cob),
    he ? 'כיסוי חלקי בהיסטוריה אינו מבטל מדידה נוכחית עדכנית. כל נתון נבדק לפי זמן המדידה שלו.'
      : 'Partial historical coverage does not invalidate a fresh current observation. Each measurement uses its own source timestamp.',
  ];
};

const treatmentFact = (
  treatment: BrowserNightscoutTreatment,
  locale: AiLocale,
): string | undefined => {
  const timestampMs = treatmentTimestampMs(treatment);
  const facts = [
    treatment.eventType?.trim(),
    treatment.carbs === undefined
      ? undefined
      : `${formatNumber(treatment.carbs)} g carbs`,
    treatment.duration === undefined
      ? undefined
      : `${formatNumber(treatment.duration)} min`,
    treatment.profile?.trim()
      ? `${locale === 'he' ? 'פרופיל' : 'profile'} ${treatment.profile.trim()}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  if (timestampMs === undefined || facts.length === 0) {
    return undefined;
  }
  return `${new Date(timestampMs).toISOString()}: ${facts.join(', ')}`;
};

const glucoseFacts = (
  entries: readonly BrowserNightscoutEntry[],
  startMs: number,
  endMs: number,
  locale: AiLocale,
): readonly string[] => {
  const sorted = [...entries].sort((left, right) => left.date - right.date);
  if (sorted.length === 0) {
    return [
      locale === 'he'
        ? 'אין דגימות סוכר בטווח.'
        : 'No glucose samples in range.',
    ];
  }
  const latest = sorted[sorted.length - 1];
  if (!latest) {
    return [];
  }
  const mean =
    sorted.reduce((sum, entry) => sum + entry.sgv, 0) / sorted.length;
  const low = sorted.filter(entry => entry.sgv < 70).length;
  const inRange = sorted.filter(
    entry => entry.sgv >= 70 && entry.sgv <= 180,
  ).length;
  const high = sorted.length - low - inRange;
  const expected = Math.max(1, Math.round((endMs - startMs) / (5 * 60_000)));
  const coverage = Math.min(100, (sorted.length / expected) * 100);
  return [
    `${
      locale === 'he'
        ? 'דגימה אחרונה בטווח שנבחר'
        : 'Latest sample in selected range'
    }: ${formatNumber(latest.sgv, 0)} mg/dL${
      latest.direction ? ` (${latest.direction})` : ''
    }, ${new Date(latest.date).toISOString()}.`,
    `${locale === 'he' ? 'דגימות' : 'Samples'}: ${sorted.length}; ${
      locale === 'he' ? 'כיסוי משוער' : 'estimated coverage'
    }: ${formatNumber(coverage)}%; ${
      locale === 'he' ? 'ממוצע' : 'mean'
    }: ${formatNumber(mean)} mg/dL.`,
    `${
      locale === 'he' ? 'חלוקה' : 'Observed bands'
    }: <70 ${low}, 70–180 ${inRange}, >180 ${high}.`,
  ];
};

export const createBrowserAiEvidenceProvider = (input: {
  readonly client: EvidenceClient;
  readonly sourceId: string;
  readonly currentDataSource?: CurrentDataSource;
  readonly getScopeKey?: () => string;
  readonly now?: () => number;
}): BrowserAiEvidenceProvider => {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(input.sourceId)) {
    throw new Error('AI evidence source identity is invalid.');
  }
  const now = input.now ?? (() => Date.now());
  const providerScopeKey = input.getScopeKey?.();
  const assertCurrentSource = (): void => {
    input.client.assertCurrentSource?.();
    if (providerScopeKey !== input.getScopeKey?.()) {
      throw new Error('AI evidence source changed during loading.');
    }
  };
  const currentDataSource = input.currentDataSource ?? createBrowserCurrentDataSource({
    client: input.client,
    now,
    ...(input.getScopeKey === undefined ? {} : {getScopeKey: input.getScopeKey}),
  });
  const loadEvidence = async (request: BrowserAiEvidenceRequest): Promise<BrowserAiEvidenceBundle> => {
      if (request.signal.aborted) {
        const error = new Error('Nightscout evidence request was cancelled.');
        error.name = 'AbortError';
        throw error;
      }
      const nowMs = now();
      assertCurrentSource();
      const period = requestedPeriod(request, nowMs);
      const [entries, treatments, current] = await Promise.all([
        input.client.readEntries(period.startMs, period.endMs, request.signal).catch(() => undefined),
        // Include a carry-in day for completed delivery intervals crossing start.
        input.client
          .readRecordedTreatments(
            Math.max(0, period.startMs - DAY_MS),
            period.endMs - 1,
            request.signal,
          )
          .catch(() => undefined),
        currentDataSource.loadCurrent({signal: request.signal}),
      ]);
      if (request.signal.aborted) {
        const error = new Error('Nightscout evidence request was cancelled.');
        error.name = 'AbortError';
        throw error;
      }
      assertCurrentSource();
      const currentAtCompletion = reobserveCurrentData(current, now());
      const recordedInsulin =
        treatments?.freshness.kind === 'fresh' && treatments.complete !== false
          ? buildRecordedInsulinSummary(
              treatments.records,
              period,
              Math.min(nowMs, treatments.freshness.fetchedAtMs),
            )
          : {quality: 'unavailable' as const};
      const units = (value: number | undefined): string =>
        value === undefined
          ? request.locale === 'he'
            ? 'לא ידוע'
            : 'unknown'
          : `${formatNumber(value, 2)} U`;
      const insulinFacts =
        recordedInsulin.quality === 'unavailable'
          ? [
              request.locale === 'he'
                ? 'כמויות אינסולין מתועדות אינן זמינות.'
                : 'Recorded insulin amounts are unavailable.',
            ]
          : [
              `${
                request.locale === 'he'
                  ? 'באזל מתועד'
                  : 'Recorded basal subtotal'
              }: ${units(recordedInsulin.basalUnits)}; ${
                request.locale === 'he' ? 'בולוס מתועד' : 'recorded bolus'
              }: ${units(recordedInsulin.bolusUnits)}.`,
              `${
                request.locale === 'he'
                  ? 'כיסוי הבאזל המתועד'
                  : 'Recorded basal coverage'
              }: ${formatNumber(
                recordedInsulin.basalCoveragePercent ?? 0,
                2,
              )}%.`,
              ...(recordedInsulin.quality === 'available'
                ? [
                    `${
                      request.locale === 'he'
                        ? 'סך אינסולין מתועד'
                        : 'Recorded insulin total'
                    }: ${units(
                      recordedInsulin.basalUnits + recordedInsulin.bolusUnits,
                    )}.`,
                  ]
                : [
                    request.locale === 'he'
                      ? 'הנתונים חלקיים. סך האינסולין אינו ידוע; החוסרים לא הושלמו לפי תכנית באזל.'
                      : 'Data is partial. Total insulin is unknown; gaps are not filled from a basal schedule.',
                  ]),
            ];

      const locale = request.locale;
      const historicalEntries = entries?.records.filter(entry =>
        entry.date >= period.startMs && entry.date <= period.endMs) ?? [];
      const visibleTreatments =
        treatments?.freshness.kind === 'fresh' && treatments.complete !== false
          ? treatments.records.flatMap(record => {
              const decoded = decodeBrowserNightscoutTreatment(record);
              const timestampMs =
                decoded === null ? undefined : treatmentTimestampMs(decoded);
              return decoded !== null &&
                timestampMs !== undefined &&
                timestampMs >= period.startMs &&
                timestampMs < period.endMs
                ? [decoded]
                : [];
            })
          : [];
      const treatmentFacts = visibleTreatments
        .map(treatment => treatmentFact(treatment, locale))
        .filter((value): value is string => value !== undefined)
        .sort()
        .slice(-MAX_TREATMENTS);
      const lines = [
        locale === 'he' ? 'ראיות Nightscout גלויות' : 'Nightscout evidence',
        `${locale === 'he' ? 'נבדק בתאריך' : 'Checked at'}: ${new Date(
          nowMs,
        ).toISOString()}.`,
        `${locale === 'he' ? 'מזהה מקור' : 'Source scope'}: ${input.sourceId}.`,
        ...currentFacts(currentAtCompletion, locale),
        `${locale === 'he' ? 'טווח' : 'Range'}: ${new Date(
          period.startMs,
        ).toISOString()} – ${new Date(period.endMs).toISOString()}.${
          period.clamped
            ? locale === 'he'
              ? ` הטווח הוגבל ל־${request.rangeDays ?? 14} הימים האחרונים.`
              : ` The range was limited to the latest ${
                  request.rangeDays ?? 14
                } days.`
            : ''
        }`,
        ...(entries === undefined ? [locale === 'he' ? 'היסטוריית הסוכר בטווח הנבחר אינה זמינה.' : 'Glucose history for the selected period is unavailable.']
          : glucoseFacts(historicalEntries, period.startMs, period.endMs, locale)),
        ...(entries?.freshness.kind === 'stale' ? [locale === 'he'
          ? 'היסטוריית הסוכר היא עותק שמור לאחר כשל באחזור; היא אינה קריאה נוכחית.'
          : 'Glucose history is a stale cached copy after a read failure; it is not a current observation.'] : []),
        ...(entries?.complete === false
          ? [
              locale === 'he'
                ? 'טווח הסוכר אינו מלא. אין להסיק ממנו מסקנות על כל התקופה.'
                : 'The glucose range is incomplete. Do not generalize it to the entire period.',
            ]
          : []),
        `${
          locale === 'he'
            ? 'אירועי טיפול מוצגים מתוך הטווח'
            : 'Displayed treatment events from the range'
        }: ${treatmentFacts.length} / ${visibleTreatments.length}.`,
        ...insulinFacts,
        ...treatmentFacts.map(fact => `- ${fact}`),
        locale === 'he'
          ? 'הנתונים תיאוריים בלבד, עשויים להיות חסרים, ואינם הוראה לשינוי טיפול.'
          : 'These facts are descriptive, may be incomplete, and are not an instruction to change therapy.',
      ];
      const expiresAtMs = currentFactsExpireAtMs(currentAtCompletion);
      return {
        text: lines.join('\n').slice(0, MAX_CONTEXT_CHARS),
        ...(expiresAtMs === undefined ? {} : {currentFactsExpireAtMs: expiresAtMs}),
      };
  };
  return {
    assertCurrentSource,
    loadEvidence,
    loadVisibleContext: async request => (await loadEvidence(request)).text,
  };
};
