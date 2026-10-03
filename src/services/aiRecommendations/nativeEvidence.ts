type Availability = 'available' | 'stale' | 'unavailable';
interface RecordedTreatmentContext {
  readonly insulinData: readonly {
    readonly type: string;
    readonly timestamp?: string;
    readonly amount?: number;
  }[];
  readonly carbTreatments: readonly {
    readonly timestamp: number;
    readonly carbs: number;
  }[];
  readonly availability: {
    readonly treatments: Availability;
    readonly deviceStatus: Availability;
    readonly profile: Availability;
  };
}

// Match the native ports' runtime boundary without importing the legacy data
// graph into portable recommendation types or the browser typecheck.
const nativeInsulinSource = require('../insulin/insulinDataSource') as {
  loadInsulinContext(request: {
    readonly startMs: number;
    readonly endMs: number;
  }): Promise<RecordedTreatmentContext>;
};

type RecordedTreatmentSummary =
  | {readonly ok: true; readonly result: Record<string, unknown>}
  | {readonly ok: false; readonly error: string};

/** Recorded treatments do not require a basal profile or calculated delivery. */
export const loadNativeRecordedTreatmentSummary = async (
  startMs: number,
  endMs: number,
): Promise<RecordedTreatmentSummary> => {
  try {
    const context = await nativeInsulinSource.loadInsulinContext({
      startMs,
      endMs,
    });
    const range = {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      days: (endMs - startMs) / 86_400_000,
    };
    if (context.availability.treatments !== 'available') {
      return {ok: true, result: {range, availability: context.availability}};
    }
    const boluses = context.insulinData.flatMap(entry => {
      const timestampMs = Date.parse(entry.timestamp ?? '');
      return entry.type === 'bolus' &&
        timestampMs >= startMs &&
        timestampMs < endMs &&
        typeof entry.amount === 'number' &&
        Number.isFinite(entry.amount) &&
        entry.amount >= 0
        ? [entry.amount]
        : [];
    });
    const carbs = context.carbTreatments.flatMap(entry =>
      entry.timestamp >= startMs &&
      entry.timestamp < endMs &&
      Number.isFinite(entry.carbs) &&
      entry.carbs >= 0
        ? [entry.carbs]
        : [],
    );
    return {
      ok: true,
      result: {
        range,
        totals: {
          bolusU: Number(
            boluses.reduce((sum, amount) => sum + amount, 0).toFixed(2),
          ),
          carbsG: Number(
            carbs.reduce((sum, amount) => sum + amount, 0).toFixed(2),
          ),
        },
        counts: {bolusCount: boluses.length, carbTreatments: carbs.length},
        availability: context.availability,
      },
    };
  } catch {
    return {ok: false, error: 'Recorded treatment data could not be loaded.'};
  }
};
