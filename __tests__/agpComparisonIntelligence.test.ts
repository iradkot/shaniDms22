import {
  buildAgpComparisonEvidence,
  runAgpComparisonOrchestra,
} from '../src/services/agpComparisonIntelligence';
import {BgSample} from '../src/types/day_bgs.types';

const range = {
  current: {
    start: new Date(2026, 0, 8, 0, 0, 0),
    end: new Date(2026, 0, 10, 23, 59, 59),
  },
  previous: {
    start: new Date(2026, 0, 1, 0, 0, 0),
    end: new Date(2026, 0, 3, 23, 59, 59),
  },
};

describe('AGP comparison intelligence', () => {
  it('detects a meaningful AGP segment difference and related settings diff', () => {
    const previousBgData = buildPeriodSamples(range.previous.start, 130, 130);
    const currentBgData = buildPeriodSamples(range.current.start, 130, 215);

    const evidence = buildAgpComparisonEvidence({
      currentRange: range.current,
      previousRange: range.previous,
      currentBgData,
      previousBgData,
      currentProfile: profileWith({carbRatioMidday: 12}),
      previousProfile: profileWith({carbRatioMidday: 9}),
    });

    const midday = evidence.segments.find(segment => segment.key === 'midday');
    expect(midday?.deltas.averageBg).toBeGreaterThan(50);
    expect(midday?.deltas.tirPct).toBeLessThan(-50);
    expect(
      evidence.settingsDiffs.some(
        diff => diff.setting === 'carbRatio' && diff.windowKey === 'midday',
      ),
    ).toBe(true);
  });

  it('builds meal insights when post-meal rise changes between periods', async () => {
    const previousStart = range.previous.start.getTime();
    const currentStart = range.current.start.getTime();
    const previousBgData = [
      ...mealResponseSamples(previousStart, 110, 155),
      ...backgroundSamples(range.previous.start, 125),
    ];
    const currentBgData = [
      ...mealResponseSamples(currentStart, 110, 230),
      ...backgroundSamples(range.current.start, 125),
    ];

    const evidence = buildAgpComparisonEvidence({
      currentRange: range.current,
      previousRange: range.previous,
      currentBgData,
      previousBgData,
      currentTreatments: mealTreatments(currentStart),
      previousTreatments: mealTreatments(previousStart),
    });

    const result = await runAgpComparisonOrchestra({evidence});

    expect(result.insights.some(insight => insight.category === 'meal')).toBe(
      true,
    );
    expect(result.summaryHe).toContain('נמצאו');
  });

  it('adds loop-context insights when closed-loop coverage changes', async () => {
    const previousBgData = buildPeriodSamples(range.previous.start, 130, 130);
    const currentBgData = buildPeriodSamples(range.current.start, 130, 130);
    const evidence = buildAgpComparisonEvidence({
      currentRange: range.current,
      previousRange: range.previous,
      currentBgData,
      previousBgData,
      currentLoopMode: loopMode({closedPct: 82, openPct: 12}),
      previousLoopMode: loopMode({closedPct: 48, openPct: 44}),
    });

    const result = await runAgpComparisonOrchestra({evidence});

    expect(
      result.insights.some(insight => insight.category === 'loop_context'),
    ).toBe(true);
    expect(result.evidence.loopMode?.deltas.closedPct).toBeGreaterThan(30);
  });
});

function buildPeriodSamples(
  startDate: Date,
  defaultBg: number,
  middayBg: number,
) {
  const samples: BgSample[] = [];
  const startMs = startDate.getTime();
  for (let day = 0; day < 3; day++) {
    for (let hour = 0; hour < 24; hour++) {
      for (const minute of [0, 15, 30, 45]) {
        const ts =
          startMs +
          day * 24 * 60 * 60_000 +
          hour * 60 * 60_000 +
          minute * 60_000;
        samples.push(
          sample(ts, hour >= 12 && hour < 16 ? middayBg : defaultBg),
        );
      }
    }
  }
  return samples;
}

function backgroundSamples(startDate: Date, bg: number) {
  const samples: BgSample[] = [];
  const startMs = startDate.getTime();
  for (let day = 0; day < 3; day++) {
    for (let hour = 0; hour < 24; hour += 2) {
      const ts = startMs + day * 24 * 60 * 60_000 + hour * 60 * 60_000;
      samples.push(sample(ts, bg));
    }
  }
  return samples;
}

function mealResponseSamples(startMs: number, mealBg: number, peakBg: number) {
  const samples: BgSample[] = [];
  for (let day = 0; day < 3; day++) {
    const mealTs = startMs + day * 24 * 60 * 60_000 + 12 * 60 * 60_000;
    samples.push(sample(mealTs, mealBg));
    samples.push(sample(mealTs + 60 * 60_000, peakBg));
    samples.push(
      sample(mealTs + 2 * 60 * 60_000, Math.round((peakBg + mealBg) / 2)),
    );
    samples.push(sample(mealTs + 3 * 60 * 60_000, mealBg + 10));
  }
  return samples;
}

function mealTreatments(startMs: number) {
  return [0, 1, 2].flatMap(day => {
    const mealTs = startMs + day * 24 * 60 * 60_000 + 12 * 60 * 60_000;
    return [
      {
        _id: `carbs-${day}`,
        eventType: 'Carb Correction',
        created_at: new Date(mealTs).toISOString(),
        carbs: 45,
      },
      {
        _id: `bolus-${day}`,
        eventType: 'Bolus',
        created_at: new Date(mealTs - 10 * 60_000).toISOString(),
        insulin: 4.5,
      },
    ];
  });
}

function profileWith(params: {carbRatioMidday: number}) {
  const profile = {
    _id: 'profile',
    defaultProfile: 'Default',
    enteredBy: 'test',
    startDate: '2026-01-01T00:00:00.000Z',
    mills: '1767225600000',
    units: 'mg/dL' as const,
    loopSettings: {} as any,
    store: {
      Default: {
        units: 'mg/dL' as const,
        timezone: 'Asia/Jerusalem',
        dia: 5,
        basal: [
          {time: '00:00', value: 0.8},
          {time: '12:00', value: 0.9},
        ],
        carbratio: [
          {time: '00:00', value: 10},
          {time: '12:00', value: params.carbRatioMidday},
        ],
        sens: [
          {time: '00:00', value: 45},
          {time: '12:00', value: 45},
        ],
        target_low: [{time: '00:00', value: 90}],
        target_high: [{time: '00:00', value: 110}],
      },
    },
  };
  return [profile];
}

function loopMode(params: {closedPct: number; openPct: number}) {
  return {
    closedPct: params.closedPct,
    openPct: params.openPct,
    unknownPct: 100 - params.closedPct - params.openPct,
    knownCoveragePct: params.closedPct + params.openPct,
    openHours: 8,
    closedHours: 16,
    openTirPct: 60,
    closedTirPct: 74,
    hasEnoughLoopCoverage: true,
    canCompareOpenClosed: true,
  };
}

function sample(ts: number, sgv: number): BgSample {
  return {
    sgv,
    date: ts,
    dateString: new Date(ts).toISOString(),
    trend: 4,
    direction: 'Flat',
    device: 'test',
    type: 'sgv',
  };
}
