/**
 * Impact Analysis Utils Tests
 *
 * Unit tests for the pure functions in impactAnalysis.utils.ts
 */

import {
  calculatePeriodStats,
  computeHourlyAggregates,
  computeDeltas,
  assessDataQuality,
  generateImpactSummary,
  calculateTimeInRangeBreakdown,
  countHypoEvents,
  countHyperEvents,
  calculateGMI,
  DEFAULT_TIR_THRESHOLDS,
} from '../../src/services/loopAnalysis/impactAnalysis.utils';
import {BgSample} from '../../src/types/day_bgs.types';
import {PeriodStats, HourlyAggregate} from '../../src/types/loopAnalysis.types';

// =============================================================================
// TEST HELPERS
// =============================================================================

function generateMockBgSamples(params: {
  count: number;
  avgBg?: number;
  stdDev?: number;
  startMs?: number;
  intervalMs?: number;
}): BgSample[] {
  const {
    count,
    avgBg = 120,
    stdDev = 20,
    startMs = Date.now() - count * 5 * 60 * 1000,
    intervalMs = 5 * 60 * 1000,
  } = params;

  const samples: BgSample[] = [];

  for (let i = 0; i < count; i++) {
    // Generate normally distributed values (Box-Muller transform)
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const sgv = Math.max(40, Math.round(avgBg + z * stdDev));

    samples.push({
      date: startMs + i * intervalMs,
      dateString: new Date(startMs + i * intervalMs).toISOString(),
      sgv,
      direction: 'Flat',
    } as BgSample);
  }

  return samples;
}

function createMockPeriodStats(overrides: Partial<PeriodStats> = {}): PeriodStats {
  const now = Date.now();
  return {
    startMs: now - 7 * 24 * 60 * 60 * 1000,
    endMs: now,
    sampleCount: 2016,
    averageBg: 130,
    stdDev: 25,
    cv: 19.2,
    timeInRange: {
      veryLow: 1,
      low: 5,
      target: 70,
      high: 20,
      veryHigh: 4,
    },
    hypoEventCount: 3,
    hyperEventCount: 5,
    totalInsulinDailyAverage: null,
    gmi: 6.4,
    ...overrides,
  };
}

// =============================================================================
// TESTS: calculateTimeInRangeBreakdown
// =============================================================================

describe('calculateTimeInRangeBreakdown', () => {
  it('returns zeros for empty samples', () => {
    const result = calculateTimeInRangeBreakdown([], DEFAULT_TIR_THRESHOLDS);
    expect(result.validCount).toBe(0);
    expect(result.breakdown.target).toBe(0);
  });

  it('calculates correct percentages for all-in-range samples', () => {
    const samples = generateMockBgSamples({count: 100, avgBg: 120, stdDev: 10});
    // Force all values to be in range
    samples.forEach(s => {
      s.sgv = 120;
    });

    const result = calculateTimeInRangeBreakdown(samples, DEFAULT_TIR_THRESHOLDS);
    expect(result.breakdown.target).toBe(100);
    expect(result.breakdown.low).toBe(0);
    expect(result.breakdown.high).toBe(0);
  });

  it('correctly classifies very low values', () => {
    const samples: BgSample[] = [{date: 1, sgv: 50} as BgSample];
    const result = calculateTimeInRangeBreakdown(samples, DEFAULT_TIR_THRESHOLDS);
    expect(result.breakdown.veryLow).toBe(100);
  });

  it('correctly classifies very high values', () => {
    const samples: BgSample[] = [{date: 1, sgv: 300} as BgSample];
    const result = calculateTimeInRangeBreakdown(samples, DEFAULT_TIR_THRESHOLDS);
    expect(result.breakdown.veryHigh).toBe(100);
  });

  it('percentages sum to 100', () => {
    const samples = generateMockBgSamples({count: 100, avgBg: 150, stdDev: 60});
    const result = calculateTimeInRangeBreakdown(samples, DEFAULT_TIR_THRESHOLDS);

    const sum =
      result.breakdown.veryLow +
      result.breakdown.low +
      result.breakdown.target +
      result.breakdown.high +
      result.breakdown.veryHigh;

    expect(sum).toBeCloseTo(100, 1);
  });
});

// =============================================================================
// TESTS: countHypoEvents
// =============================================================================

describe('countHypoEvents', () => {
  it('returns 0 for empty samples', () => {
    expect(countHypoEvents([], 70)).toBe(0);
  });

  it('counts a single hypo event', () => {
    const samples: BgSample[] = [
      {date: 1000, sgv: 80} as BgSample,
      {date: 2000, sgv: 65} as BgSample, // Start of hypo
      {date: 3000, sgv: 55} as BgSample,
      {date: 4000, sgv: 60} as BgSample,
      {date: 5000, sgv: 75} as BgSample, // End of hypo
    ];
    expect(countHypoEvents(samples, 70)).toBe(1);
  });

  it('counts multiple distinct hypo events', () => {
    const samples: BgSample[] = [
      {date: 1000, sgv: 65} as BgSample, // First hypo
      {date: 2000, sgv: 55} as BgSample,
      {date: 3000, sgv: 80} as BgSample, // Recovery
      {date: 4000, sgv: 90} as BgSample,
      {date: 5000, sgv: 60} as BgSample, // Second hypo
      {date: 6000, sgv: 85} as BgSample, // Recovery
    ];
    expect(countHypoEvents(samples, 70)).toBe(2);
  });

  it('treats large gaps as separate events', () => {
    const GAP_MS = 25 * 60 * 1000; // 25 minutes (> 20 min threshold)
    const samples: BgSample[] = [
      {date: 1000, sgv: 60} as BgSample, // First hypo
      {date: 2000, sgv: 55} as BgSample,
      {date: 2000 + GAP_MS, sgv: 58} as BgSample, // After gap - new event
      {date: 2000 + GAP_MS + 1000, sgv: 62} as BgSample,
    ];
    expect(countHypoEvents(samples, 70)).toBe(2);
  });
});

// =============================================================================
// TESTS: calculateGMI
// =============================================================================

describe('calculateGMI', () => {
  it('returns null for null input', () => {
    expect(calculateGMI(null)).toBeNull();
  });

  it('returns null for zero or negative input', () => {
    expect(calculateGMI(0)).toBeNull();
    expect(calculateGMI(-100)).toBeNull();
  });

  it('calculates correct GMI for typical values', () => {
    // GMI = 3.31 + 0.02392 × avgBg
    expect(calculateGMI(100)).toBeCloseTo(5.70, 2);
    expect(calculateGMI(150)).toBeCloseTo(6.90, 2);
    expect(calculateGMI(200)).toBeCloseTo(8.09, 2);
  });
});

// =============================================================================
// TESTS: calculatePeriodStats
// =============================================================================

describe('calculatePeriodStats', () => {
  it('returns zero/null values for empty samples', () => {
    const stats = calculatePeriodStats([], 0, 1000, DEFAULT_TIR_THRESHOLDS);

    expect(stats.sampleCount).toBe(0);
    expect(stats.averageBg).toBeNull();
    expect(stats.stdDev).toBeNull();
    expect(stats.timeInRange.target).toBe(0);
  });

  it('filters samples to within the period range', () => {
    const samples: BgSample[] = [
      {date: 500, sgv: 100} as BgSample, // Before range
      {date: 1500, sgv: 120} as BgSample, // In range
      {date: 2500, sgv: 140} as BgSample, // In range
      {date: 3500, sgv: 160} as BgSample, // After range
    ];

    const stats = calculatePeriodStats(samples, 1000, 3000, DEFAULT_TIR_THRESHOLDS);

    expect(stats.sampleCount).toBe(2);
    expect(stats.averageBg).toBe(130); // (120 + 140) / 2
  });

  it('calculates GMI from average BG', () => {
    const samples = generateMockBgSamples({count: 100, avgBg: 150, stdDev: 0});
    const startMs = samples[0].date - 1000;
    const endMs = samples[samples.length - 1].date + 1000;

    const stats = calculatePeriodStats(samples, startMs, endMs, DEFAULT_TIR_THRESHOLDS);

    expect(stats.gmi).toBeCloseTo(6.9, 1);
  });
});

// =============================================================================
// TESTS: computeHourlyAggregates
// =============================================================================

describe('computeHourlyAggregates', () => {
  it('returns 24 hourly buckets', () => {
    const result = computeHourlyAggregates([]);
    expect(result.length).toBe(24);
    expect(result[0].hour).toBe(0);
    expect(result[23].hour).toBe(23);
  });

  it('groups samples by hour of day', () => {
    // Create samples at specific hours
    const baseDate = new Date('2026-01-15T00:00:00Z');
    const samples: BgSample[] = [
      {date: baseDate.getTime(), sgv: 100} as BgSample, // Hour 0
      {date: baseDate.getTime() + 1000, sgv: 110} as BgSample, // Hour 0
      {date: baseDate.getTime() + 3600000, sgv: 120} as BgSample, // Hour 1
    ];

    const result = computeHourlyAggregates(samples);

    // Check UTC hour 0 (may differ based on timezone)
    const hour0 = result.find((h: HourlyAggregate) => h.count === 2);
    const hour1 = result.find((h: HourlyAggregate) => h.count === 1 && h.meanBg === 120);

    expect(hour0).toBeDefined();
    expect(hour0?.meanBg).toBe(105); // (100 + 110) / 2
    expect(hour1).toBeDefined();
  });

  it('calculates percentiles correctly', () => {
    // Create 10 samples for hour 0: 100, 110, 120, ..., 190
    const baseDate = new Date('2026-01-15T00:00:00Z');
    const samples: BgSample[] = [];
    for (let i = 0; i < 10; i++) {
      samples.push({
        date: baseDate.getTime() + i * 60000,
        sgv: 100 + i * 10,
      } as BgSample);
    }

    const result = computeHourlyAggregates(samples);
    const hour0 = result[baseDate.getUTCHours()];

    expect(hour0.count).toBe(10);
    expect(hour0.median).toBeCloseTo(145, 0);
    expect(hour0.p10).toBeCloseTo(109, 0);
    expect(hour0.p90).toBeCloseTo(181, 0);
  });
});

// =============================================================================
// TESTS: computeDeltas
// =============================================================================

describe('computeDeltas', () => {
  it('calculates TIR delta correctly', () => {
    const preChange = createMockPeriodStats({timeInRange: {...createMockPeriodStats().timeInRange, target: 60}});
    const postChange = createMockPeriodStats({timeInRange: {...createMockPeriodStats().timeInRange, target: 75}});

    const deltas = computeDeltas(preChange, postChange);

    expect(deltas.tirDelta).toBe(15);
  });

  it('calculates avgBg delta correctly (negative is improvement)', () => {
    const preChange = createMockPeriodStats({averageBg: 150});
    const postChange = createMockPeriodStats({averageBg: 130});

    const deltas = computeDeltas(preChange, postChange);

    expect(deltas.avgBgDelta).toBe(-20);
  });

  it('marks significant when TIR change >= 3%', () => {
    const preChange = createMockPeriodStats({timeInRange: {...createMockPeriodStats().timeInRange, target: 70}});
    const postChange = createMockPeriodStats({timeInRange: {...createMockPeriodStats().timeInRange, target: 73}});

    const deltas = computeDeltas(preChange, postChange);

    expect(deltas.isSignificant).toBe(true);
  });

  it('marks not significant for small changes', () => {
    const preChange = createMockPeriodStats({
      averageBg: 130,
      timeInRange: {...createMockPeriodStats().timeInRange, target: 70},
    });
    const postChange = createMockPeriodStats({
      averageBg: 132,
      timeInRange: {...createMockPeriodStats().timeInRange, target: 71},
    });

    const deltas = computeDeltas(preChange, postChange);

    expect(deltas.isSignificant).toBe(false);
    expect(deltas.overallTrend).toBe('neutral');
  });

  it('classifies improvement correctly', () => {
    const preChange = createMockPeriodStats({
      timeInRange: {...createMockPeriodStats().timeInRange, target: 60},
      hypoEventCount: 5,
    });
    const postChange = createMockPeriodStats({
      timeInRange: {...createMockPeriodStats().timeInRange, target: 70},
      hypoEventCount: 3,
    });

    const deltas = computeDeltas(preChange, postChange);

    expect(deltas.overallTrend).toBe('improved');
  });

  it('classifies worsened correctly', () => {
    const preChange = createMockPeriodStats({
      timeInRange: {...createMockPeriodStats().timeInRange, target: 70},
    });
    const postChange = createMockPeriodStats({
      timeInRange: {...createMockPeriodStats().timeInRange, target: 55},
    });

    const deltas = computeDeltas(preChange, postChange);

    expect(deltas.overallTrend).toBe('worsened');
  });
});

// =============================================================================
// TESTS: assessDataQuality
// =============================================================================

describe('assessDataQuality', () => {
  it('flags insufficient data when coverage is low', () => {
    const expected7DaySamples = 7 * 288; // ~2016
    const preSamples = generateMockBgSamples({count: 500}); // ~25%
    const postSamples = generateMockBgSamples({count: 500});

    const quality = assessDataQuality(preSamples, postSamples, 7);

    expect(quality.hasEnoughData).toBe(false);
    expect(quality.warnings.length).toBeGreaterThan(0);
  });

  it('passes when coverage is sufficient', () => {
    const preSamples = generateMockBgSamples({count: 2000});
    const postSamples = generateMockBgSamples({count: 2000});

    const quality = assessDataQuality(preSamples, postSamples, 7);

    expect(quality.hasEnoughData).toBe(true);
  });

  it('detects large gaps in data', () => {
    const GAP_MS = 3 * 60 * 60 * 1000; // 3 hours
    const preSamples: BgSample[] = [
      {date: 1000, sgv: 100} as BgSample,
      {date: 1000 + GAP_MS, sgv: 100} as BgSample,
      {date: 1000 + GAP_MS + 1000, sgv: 100} as BgSample,
      {date: 1000 + GAP_MS * 2, sgv: 100} as BgSample,
      {date: 1000 + GAP_MS * 2 + 1000, sgv: 100} as BgSample,
      {date: 1000 + GAP_MS * 3, sgv: 100} as BgSample,
      {date: 1000 + GAP_MS * 3 + 1000, sgv: 100} as BgSample,
      {date: 1000 + GAP_MS * 4, sgv: 100} as BgSample,
    ];
    // Need more samples to reach coverage threshold
    for (let i = 0; i < 2000; i++) {
      preSamples.push({date: 2000 + i * 300000, sgv: 100} as BgSample);
    }

    const quality = assessDataQuality(preSamples, preSamples, 7);

    expect(quality.preGapCount).toBeGreaterThan(0);
  });
});

// =============================================================================
// TESTS: generateImpactSummary
// =============================================================================

describe('generateImpactSummary', () => {
  it('generates neutral summary for non-significant changes', () => {
    const preChange = createMockPeriodStats();
    const postChange = createMockPeriodStats();
    const deltas = computeDeltas(preChange, postChange);

    const summary = generateImpactSummary(deltas, preChange, postChange, 7);

    expect(summary).toContain('no significant changes');
  });

  it('includes TIR change in summary', () => {
    const preChange = createMockPeriodStats({
      timeInRange: {...createMockPeriodStats().timeInRange, target: 60},
    });
    const postChange = createMockPeriodStats({
      timeInRange: {...createMockPeriodStats().timeInRange, target: 75},
    });
    const deltas = computeDeltas(preChange, postChange);

    const summary = generateImpactSummary(deltas, preChange, postChange, 7);

    expect(summary).toContain('Time in Range');
    expect(summary).toContain('increased');
    expect(summary).toContain('15');
  });

  it('includes avg BG change in summary', () => {
    const preChange = createMockPeriodStats({averageBg: 160});
    const postChange = createMockPeriodStats({averageBg: 140});
    const deltas = computeDeltas(preChange, postChange);

    const summary = generateImpactSummary(deltas, preChange, postChange, 7);

    expect(summary).toContain('Average glucose');
    expect(summary).toContain('dropped');
  });

  it('mentions positive outcome', () => {
    const preChange = createMockPeriodStats({
      timeInRange: {...createMockPeriodStats().timeInRange, target: 60},
      hypoEventCount: 5,
    });
    const postChange = createMockPeriodStats({
      timeInRange: {...createMockPeriodStats().timeInRange, target: 75},
      hypoEventCount: 2,
    });
    const deltas = computeDeltas(preChange, postChange);

    const summary = generateImpactSummary(deltas, preChange, postChange, 7);

    expect(summary).toContain('positive change');
  });
});
