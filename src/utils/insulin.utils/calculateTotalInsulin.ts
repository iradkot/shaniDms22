import {InsulinDataEntry, BasalProfile} from 'app/types/insulin.types';
import {
  buildBasalDeliveryTimeline,
  sumBasalDelivery,
} from './basalDeliveryTimeline';

/**
 * Legacy chart model: integrates programmed basal and normalized bolus events.
 * A valid result is still an estimate, not recorded delivery. New analysis
 * callers use getModeledInsulinRangeMetrics; recorded totals use
 * recordedInsulinDataSource/buildRecordedInsulinSummary. See docs/DATA_ACCESS.md.
 */
export const calculateTotalInsulin = (
  insulinData: InsulinDataEntry[],
  basalProfile: BasalProfile,
  startDate: Date,
  endDate: Date,
): {totalBasal: number; totalBolus: number} => {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const totalBasal = sumBasalDelivery(
    buildBasalDeliveryTimeline({
      basalProfile,
      insulinData,
      startDate,
      endDate,
    }),
  );

  const totalBolusInsulin = insulinData.reduce((total, entry) => {
    if (entry.type !== 'bolus') return total;
    const timestampMs = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
    const amount =
      typeof entry.amount === 'number' && Number.isFinite(entry.amount)
        ? entry.amount
        : NaN;
    if (
      !Number.isFinite(timestampMs) ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      timestampMs < startMs ||
      timestampMs >= endMs
    ) {
      return total;
    }
    return total + amount;
  }, 0);

  return {totalBasal, totalBolus: totalBolusInsulin};
};
