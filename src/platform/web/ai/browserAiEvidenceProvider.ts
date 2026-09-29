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

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_RANGE_MS = 14 * DAY_MS;
const DEVICE_STATUS_RANGE_MS = 2 * 60 * 60 * 1_000;
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
}

interface EvidenceClient {
  assertCurrentSource?(): void;
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

const ensureFresh = (
  ranges: readonly BrowserNightscoutRange<unknown>[],
): void => {
  if (ranges.some(range => range.freshness.kind !== 'fresh')) {
    throw new Error('Fresh Nightscout evidence is unavailable.');
  }
};

const formatNumber = (value: number, maximumFractionDigits = 1): string =>
  new Intl.NumberFormat('en-US', {maximumFractionDigits}).format(value);

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
  readonly now?: () => number;
}): BrowserAiEvidenceProvider => {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(input.sourceId)) {
    throw new Error('AI evidence source identity is invalid.');
  }
  const now = input.now ?? Date.now;
  return {
    async loadVisibleContext(request) {
      if (request.signal.aborted) {
        const error = new Error('Nightscout evidence request was cancelled.');
        error.name = 'AbortError';
        throw error;
      }
      const nowMs = now();
      const period = requestedPeriod(request, nowMs);
      const deviceStartMs = Math.max(
        period.startMs,
        period.endMs - DEVICE_STATUS_RANGE_MS,
      );
      const [entries, treatments, deviceStatuses] = await Promise.all([
        input.client.readEntries(period.startMs, period.endMs, request.signal),
        // Include a carry-in day for completed delivery intervals crossing start.
        input.client
          .readRecordedTreatments(
            Math.max(0, period.startMs - DAY_MS),
            period.endMs - 1,
            request.signal,
          )
          .catch(() => undefined),
        input.client.readDeviceStatuses(
          deviceStartMs,
          period.endMs,
          request.signal,
        ),
      ]);
      if (request.signal.aborted) {
        const error = new Error('Nightscout evidence request was cancelled.');
        error.name = 'AbortError';
        throw error;
      }
      input.client.assertCurrentSource?.();
      ensureFresh([entries, deviceStatuses]);
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
      const latestDeviceStatus = [...deviceStatuses.records].sort(
        (left, right) => right.createdAtMs - left.createdAtMs,
      )[0];
      const deviceFacts = latestDeviceStatus
        ? [
            latestDeviceStatus.iobUnits === undefined
              ? undefined
              : `IOB ${formatNumber(latestDeviceStatus.iobUnits)} U`,
            latestDeviceStatus.cobGrams === undefined
              ? undefined
              : `COB ${formatNumber(latestDeviceStatus.cobGrams)} g`,
          ].filter((value): value is string => value !== undefined)
        : [];
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
        ...glucoseFacts(entries.records, period.startMs, period.endMs, locale),
        ...(!entries.records.some(
          entry => entry.date <= nowMs && entry.date >= nowMs - 15 * 60_000,
        )
          ? [
              locale === 'he'
                ? 'אין קריאת סוכר עדכנית מ־15 הדקות האחרונות. אין להסיק מהנתונים מה מצב הסוכר עכשיו.'
                : 'No current glucose reading from the last 15 minutes. Do not infer current glucose from historical data.',
            ]
          : []),
        ...(entries.complete === false
          ? [
              locale === 'he'
                ? 'טווח הסוכר אינו מלא. אין להסיק ממנו מסקנות על כל התקופה.'
                : 'The glucose range is incomplete. Do not generalize it to the entire period.',
            ]
          : []),
        ...(deviceFacts.length === 0
          ? []
          : [
              `${
                locale === 'he' ? 'דגימת מכשיר אחרונה' : 'Latest device sample'
              }: ${deviceFacts.join(', ')}, ${new Date(
                latestDeviceStatus!.createdAtMs,
              ).toISOString()}.`,
              ...(nowMs - latestDeviceStatus!.createdAtMs > 15 * 60_000
                ? [
                    locale === 'he'
                      ? 'דגימת המכשיר ישנה; IOB ו־COB אינם מעידים על המצב עכשיו.'
                      : 'Device sample is stale; IOB and COB do not establish the current state.',
                  ]
                : []),
            ]),
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
      return lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
    },
  };
};
