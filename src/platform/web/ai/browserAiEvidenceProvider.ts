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
import {treatmentTimestampMs} from '../nightscout';

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_RANGE_MS = 14 * DAY_MS;
const DEVICE_STATUS_RANGE_MS = 2 * 60 * 60 * 1_000;
const MAX_CONTEXT_CHARS = 8_000;
const MAX_TREATMENTS = 24;

export interface BrowserAiEvidenceRequest {
  readonly specialist: AiSpecialistId;
  readonly locale: AiLocale;
  readonly focus?: AiConversationFocus;
  readonly signal: AbortSignal;
}

export interface BrowserAiEvidenceProvider {
  loadVisibleContext(request: BrowserAiEvidenceRequest): Promise<string>;
}

interface EvidenceClient {
  readEntries(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutEntry>>;
  readTreatments(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutTreatment>>;
  readDeviceStatuses(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutDeviceStatus>>;
}

const requestedPeriod = (
  request: BrowserAiEvidenceRequest,
  nowMs: number,
): {readonly startMs: number; readonly endMs: number; readonly clamped: boolean} => {
  const focus = request.focus;
  let requestedStart = nowMs - MAX_RANGE_MS;
  let requestedEnd = nowMs;
  if (focus?.kind === 'day' && Number.isSafeInteger(focus.dayStartMs)) {
    requestedStart = focus.dayStartMs;
    requestedEnd = Math.min(nowMs, focus.dayStartMs + DAY_MS);
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
  const startMs = Math.max(0, requestedStart, endMs - MAX_RANGE_MS);
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
    treatment.insulin === undefined
      ? undefined
      : `${formatNumber(treatment.insulin, 2)} U insulin`,
    treatment.amount === undefined
      ? undefined
      : `${formatNumber(treatment.amount)} amount`,
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
    return [locale === 'he' ? 'אין דגימות סוכר בטווח.' : 'No glucose samples in range.'];
  }
  const latest = sorted[sorted.length - 1];
  if (!latest) {
    return [];
  }
  const mean = sorted.reduce((sum, entry) => sum + entry.sgv, 0) / sorted.length;
  const low = sorted.filter(entry => entry.sgv < 70).length;
  const inRange = sorted.filter(entry => entry.sgv >= 70 && entry.sgv <= 180).length;
  const high = sorted.length - low - inRange;
  const expected = Math.max(1, Math.round((endMs - startMs) / (5 * 60_000)));
  const coverage = Math.min(100, (sorted.length / expected) * 100);
  return [
    `${locale === 'he' ? 'דגימה אחרונה' : 'Current snapshot'}: ${formatNumber(
      latest.sgv,
      0,
    )} mg/dL${latest.direction ? ` (${latest.direction})` : ''}, ${new Date(
      latest.date,
    ).toISOString()}.`,
    `${locale === 'he' ? 'דגימות' : 'Samples'}: ${sorted.length}; ${
      locale === 'he' ? 'כיסוי משוער' : 'estimated coverage'
    }: ${formatNumber(coverage)}%; ${locale === 'he' ? 'ממוצע' : 'mean'}: ${formatNumber(
      mean,
    )} mg/dL.`,
    `${locale === 'he' ? 'חלוקה' : 'Observed bands'}: <70 ${low}, 70–180 ${inRange}, >180 ${high}.`,
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
      const deviceStartMs = Math.max(period.startMs, period.endMs - DEVICE_STATUS_RANGE_MS);
      const [entries, treatments, deviceStatuses] = await Promise.all([
        input.client.readEntries(period.startMs, period.endMs, request.signal),
        input.client.readTreatments(period.startMs, period.endMs, request.signal),
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
      ensureFresh([entries, treatments, deviceStatuses]);

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
      const treatmentFacts = treatments.records
        .map(treatment => treatmentFact(treatment, locale))
        .filter((value): value is string => value !== undefined)
        .sort()
        .slice(-MAX_TREATMENTS);
      const lines = [
        locale === 'he' ? 'ראיות Nightscout גלויות' : 'Nightscout evidence',
        `${locale === 'he' ? 'מזהה מקור' : 'Source scope'}: ${input.sourceId}.`,
        `${locale === 'he' ? 'טווח' : 'Range'}: ${new Date(
          period.startMs,
        ).toISOString()} – ${new Date(period.endMs).toISOString()}.${
          period.clamped || period.endMs - period.startMs >= MAX_RANGE_MS - 1
            ? locale === 'he'
              ? ' הטווח הוגבל ל־14 הימים האחרונים.'
              : ' The range was limited to the latest 14 days.'
            : ''
        }`,
        ...glucoseFacts(entries.records, period.startMs, period.endMs, locale),
        ...(deviceFacts.length === 0
          ? []
          : [`${locale === 'he' ? 'מצב נוכחי' : 'Current device status'}: ${deviceFacts.join(', ')}.`]),
        `${locale === 'he' ? 'אירועי טיפול בטווח' : 'Treatment events in range'}: ${treatmentFacts.length}.`,
        ...treatmentFacts.map(fact => `- ${fact}`),
        locale === 'he'
          ? 'הנתונים תיאוריים בלבד, עשויים להיות חסרים, ואינם הוראה לשינוי טיפול.'
          : 'These facts are descriptive, may be incomplete, and are not an instruction to change therapy.',
      ];
      return lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
    },
  };
};
