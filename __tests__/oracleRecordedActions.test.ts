import {
  computeOracleInsights,
  computeOracleInsightsProgressive,
} from 'app/services/oracle/oracleMatching';
import type {BgSample} from 'app/types/day_bgs.types';
import type {OracleCachedTreatment} from 'app/services/oracle/oracleTypes';

const MINUTE = 60_000;
const PAST = Date.parse('2026-08-01T12:00:00Z');
const NOW = PAST + 24 * 60 * MINUTE;
const sample = (date: number) => ({date, sgv: 120} as BgSample);
const history = Array.from({length: 85}, (_, i) => sample(PAST + (i * 5 - 120) * MINUTE));
const recentBg = [-15, -10, -5, 0].map(min => sample(NOW + min * MINUTE));

describe.each([
  ['synchronous', computeOracleInsights],
  ['progressive', computeOracleInsightsProgressive],
] as const)('Oracle %s recorded action summaries', (_name, compute) => {
  it('keeps unknown bolus evidence separate from a verified zero dose', async () => {
    const treatments: OracleCachedTreatment[] = [
      {ts: PAST + 5 * MINUTE, eventType: 'Correction Bolus', insulinBasis: 'unknown-bolus'},
    ];
    const result = await compute({anchor: sample(NOW), recentBg, history, treatments, deviceStatus: [], includeLoadInMatching: false});
    const match = result.matches.find(item => item.anchorTs === PAST);
    expect(match).toBeDefined();
    expect(match?.actions30m?.insulin).toBeNull();
    expect(match?.actionCounts30m?.boluses).toBeNull();
    expect(result.strategies.some(card => card.key === 'insulin.unknown')).toBe(true);

    const zero = await compute({anchor: sample(NOW), recentBg, history, treatments: [
      {ts: PAST + 5 * MINUTE, eventType: 'Correction Bolus', insulinBasis: 'recorded-bolus', insulin: 0},
    ], deviceStatus: [], includeLoadInMatching: false});
    expect(zero.matches.find(item => item.anchorTs === PAST)?.actions30m?.insulin).toBe(0);
  });

  it('allocates completed extended boluses across the action window boundaries', async () => {
    const result = await compute({anchor: sample(NOW), recentBg, history, treatments: [
      {ts: PAST - 10 * MINUTE, endTs: PAST + 10 * MINUTE, eventType: 'Extended Bolus', insulinBasis: 'recorded-bolus', insulin: 2},
      {ts: PAST + 20 * MINUTE, endTs: PAST + 40 * MINUTE, eventType: 'Extended Bolus', insulinBasis: 'recorded-bolus', insulin: 2},
    ], deviceStatus: [], includeLoadInMatching: false});
    const match = result.matches.find(item => item.anchorTs === PAST);
    expect(match?.actions30m?.insulin).toBe(2);
    expect(match?.actionCounts30m?.boluses).toBe(2);
    expect(match?.treatments30m).toHaveLength(2);
  });
});
