import type {DailyInsulinSourceSummary} from 'app/modules/dailyOverview';
import {recordedInsulinDisplay} from 'app/product/dailyOverview/dailyOverviewPresentation';

/** Present the shared raw-dose calculation; charts and profiles never establish delivery. */
export const computeInsulinStats = (summary: DailyInsulinSourceSummary) =>
  recordedInsulinDisplay(summary);

/** The older native bridge has no quality labels, so it accepts complete recorded facts only. */
export const recordedInsulinBridgeStats = (
  summary: DailyInsulinSourceSummary,
) => {
  const insulin = computeInsulinStats(summary);
  if (
    insulin.total === undefined ||
    insulin.basal === undefined ||
    insulin.bolus === undefined
  ) {
    return undefined;
  }
  return {
    totalBasal: insulin.basal,
    totalBolus: insulin.bolus,
    totalInsulin: insulin.total,
    basalBolusRatio: insulin.total > 0 ? insulin.basal / insulin.total : 0,
  };
};
