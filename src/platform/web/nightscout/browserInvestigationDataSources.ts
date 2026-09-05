import type {
  LoopChangesDataSource,
  LoopChangeSourceKind,
  LoopSettingChange,
} from '../../../modules/loopChanges';
import type {SimilarEventsDataSource} from '../../../modules/similarEvents';
import type {
  TrendsDataSource,
  TrendsGlucoseSample,
  TrendsPeriod,
} from '../../../modules/trends';
import type {DestinationLocale} from '../../../product/destinations';
import type {
  BrowserNightscoutClient,
  BrowserNightscoutTreatment,
} from './browserNightscoutClient';
import {treatmentTimestampMs} from './browserNightscoutClient';

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_RANGE_MS = 30 * DAY_MS;

type BrowserInvestigationReader = Pick<
  BrowserNightscoutClient,
  'readEntries' | 'readTreatments'
>;

export interface BrowserInvestigationDataSources {
  readonly similarEvents: SimilarEventsDataSource;
  readonly loopChanges: LoopChangesDataSource;
}

const rangeChunks = (period: TrendsPeriod): readonly TrendsPeriod[] => {
  if (
    !Number.isSafeInteger(period.startMs) ||
    !Number.isSafeInteger(period.endMs) ||
    period.startMs >= period.endMs
  ) {
    throw new Error('The investigation period is invalid.');
  }
  const chunks: TrendsPeriod[] = [];
  for (let startMs = period.startMs; startMs < period.endMs; ) {
    const endMs = Math.min(startMs + MAX_RANGE_MS, period.endMs);
    chunks.push({startMs, endMs});
    startMs = endMs;
  }
  return chunks;
};

const glucoseSamples = (
  records: readonly {readonly date: number; readonly sgv: number}[],
): readonly TrendsGlucoseSample[] =>
  records.map(record => ({
    timestampMs: record.date,
    valueMgDl: record.sgv,
  }));

const sourceKind = (
  treatment: BrowserNightscoutTreatment,
): LoopChangeSourceKind => {
  const source = `${treatment.enteredBy ?? ''} ${treatment.app ?? ''}`
    .trim()
    .toLocaleLowerCase('en-US');
  if (source.includes('androidaps') || source.includes('aaps')) {
    return 'androidaps';
  }
  if (source.includes('loop')) {
    return 'loop-ios';
  }
  return 'nightscout-profile';
};

const sourceLabel = (
  kind: LoopChangeSourceKind,
  locale: DestinationLocale,
): string => {
  if (kind === 'androidaps') {
    return locale === 'he'
      ? 'AndroidAPS דרך Nightscout'
      : 'AndroidAPS via Nightscout';
  }
  if (kind === 'loop-ios') {
    return locale === 'he' ? 'Loop דרך Nightscout' : 'Loop via Nightscout';
  }
  return 'Nightscout';
};

const isProfileSwitch = (treatment: BrowserNightscoutTreatment): boolean =>
  treatment.profile !== undefined ||
  treatment.eventType?.trim().toLocaleLowerCase('en-US') === 'profile switch';

const stableFingerprint = (value: string): string => {
  let hash = 17;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2_147_483_647;
  }
  return hash.toString(16).padStart(8, '0');
};

const profileSwitchChange = (
  treatment: BrowserNightscoutTreatment,
  locale: DestinationLocale,
): LoopSettingChange | undefined => {
  if (!isProfileSwitch(treatment)) {
    return undefined;
  }
  const changedAtMs = treatmentTimestampMs(treatment);
  if (changedAtMs === undefined) {
    return undefined;
  }
  const kind = sourceKind(treatment);
  const profile = treatment.profile?.trim();
  const summary = profile
    ? locale === 'he'
      ? `מעבר לפרופיל ${profile}`
      : `Switched to profile ${profile}`
    : locale === 'he'
    ? 'תועד מעבר פרופיל'
    : 'A profile switch was recorded';
  return {
    id:
      treatment._id ??
      treatment.identifier ??
      `nightscout-profile-switch:${changedAtMs}:${stableFingerprint(
        `${treatment.eventType ?? ''}|${profile ?? ''}|${
          treatment.enteredBy ?? ''
        }|${treatment.app ?? ''}`,
      )}`,
    changedAtMs,
    kind: 'other',
    summary,
    source: {
      authority: 'observed',
      kind,
      label: sourceLabel(kind, locale),
    },
  };
};

/**
 * Browser-only read adapters. Similar Events uses the same bounded glucose
 * source as Trends. Loop history exposes only factual Nightscout profile-switch
 * treatments; absent profile history is represented by an empty result.
 */
export const createBrowserInvestigationDataSources = (input: {
  readonly client: BrowserInvestigationReader;
  readonly trends: TrendsDataSource;
  readonly locale: DestinationLocale;
}): BrowserInvestigationDataSources => ({
  similarEvents: {
    async loadGlucoseSamples(period, signal) {
      if (signal.aborted) {
        const aborted = new Error('The Similar Events request was cancelled.');
        aborted.name = 'AbortError';
        throw aborted;
      }
      const result = await input.client.readEntries(
        period.startMs,
        period.endMs,
        signal,
      );
      if (signal.aborted) {
        const aborted = new Error('The Similar Events request was cancelled.');
        aborted.name = 'AbortError';
        throw aborted;
      }
      return glucoseSamples(result.records);
    },
  },
  loopChanges: {
    loadGlucoseSamples: period => input.trends.loadGlucoseSamples(period),
    async loadChanges(period) {
      const byId = new Map<string, LoopSettingChange>();
      for (const chunk of rangeChunks(period)) {
        const result = await input.client.readTreatments(
          chunk.startMs,
          chunk.endMs,
        );
        result.records.forEach(treatment => {
          const change = profileSwitchChange(treatment, input.locale);
          if (
            change !== undefined &&
            change.changedAtMs >= period.startMs &&
            change.changedAtMs < period.endMs &&
            !byId.has(change.id)
          ) {
            byId.set(change.id, change);
          }
        });
      }
      return [...byId.values()].sort(
        (left, right) => right.changedAtMs - left.changedAtMs,
      );
    },
  },
});
