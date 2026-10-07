import {
  fetchTreatmentsForDateRangeWithMetadata,
  type NightscoutRangeResult,
} from '../../../api/apiRequests';
import type {JournalWorkspace} from '../../../modules/journal';
import {
  buildTherapyContextSnapshot,
  type TherapyContextDataSource,
  type TrendsDataSource,
  type TrendsRangeThresholds,
} from '../../../modules/trends';
import {projectNightscoutTherapyContext} from '../../nightscout/therapyContextProjection';
import {buildRecordedInsulinSummary} from '../../../services/insulin/recordedInsulin';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NativeTherapyContextDataSourceDependencies {
  readonly glucoseDataSource: TrendsDataSource;
  readonly journal?: JournalWorkspace;
  readonly thresholds?: Pick<
    TrendsRangeThresholds,
    'targetMinMgDl' | 'targetMaxMgDl'
  >;
  readonly loadTreatments?: (
    start: Date,
    end: Date,
  ) => Promise<NightscoutRangeResult<Record<string, unknown>>>;
}

/** Native read adapter. Empty facts stay empty; source failures reject. */
export const createNativeTherapyContextDataSource = (
  dependencies: NativeTherapyContextDataSourceDependencies,
): TherapyContextDataSource => {
  const loadTreatments =
    dependencies.loadTreatments ?? fetchTreatmentsForDateRangeWithMetadata;
  return {
    async loadTherapyContext(period) {
      const [glucose, treatmentRange] = await Promise.all([
        dependencies.glucoseDataSource.loadGlucoseSnapshot
          ? dependencies.glucoseDataSource.loadGlucoseSnapshot(period)
          : dependencies.glucoseDataSource
              .loadGlucoseSamples(period)
              .then(samples => ({
                samples,
                freshness: {kind: 'unknown' as const},
              })),
        loadTreatments(
          new Date(period.startMs - DAY_MS),
          new Date(period.endMs - 1),
        ),
      ]);
      if (
        treatmentRange.freshness.kind !== 'fresh' ||
        treatmentRange.complete === false
      ) {
        throw new Error(
          'Therapy Context requires fresh, complete treatment history.',
        );
      }
      const projected = projectNightscoutTherapyContext(treatmentRange.records);
      const timeRange = {
        fromInclusive: period.startMs,
        toExclusive: period.endMs,
      };
      const meals =
        dependencies.journal?.meals.getListSnapshot({timeRange}).items ?? [];
      const activities =
        dependencies.journal?.activities.getListSnapshot({timeRange}).items ??
        [];
      return buildTherapyContextSnapshot({
        period,
        glucoseSamples: glucose.samples,
        sourceReliability:
          glucose.freshness.kind === 'fresh' ? 'reliable' : 'unverified',
        treatments: projected.treatments,
        recordedInsulin: buildRecordedInsulinSummary(
          treatmentRange.records,
          period,
          treatmentRange.freshness.fetchedAtMs,
        ),
        mealStartedAtMs: meals.map(meal => meal.mealStart),
        activities: activities.map(activity => ({
          startedAtMs: activity.startedAt,
          ...(activity.endedAt === undefined
            ? {}
            : {endedAtMs: activity.endedAt}),
        })),
        modeChanges: projected.modeChanges,
        timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
        ...(dependencies.thresholds === undefined
          ? {}
          : {
              targetMinMgDl: dependencies.thresholds.targetMinMgDl,
              targetMaxMgDl: dependencies.thresholds.targetMaxMgDl,
            }),
      });
    },
  };
};
