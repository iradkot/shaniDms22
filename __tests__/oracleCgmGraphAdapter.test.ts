import {
  buildOracleMatchDetailsPayload,
  oracleMatchToCgmGraphData,
} from 'app/services/oracle/oracleCgmGraphAdapter';
import type {OracleMatchTrace} from 'app/services/oracle/oracleTypes';
import {ORACLE_MINUTE_MS} from 'app/services/oracle/oracleConstants';

function makeMatch(overrides?: Partial<OracleMatchTrace>): OracleMatchTrace {
  const base: OracleMatchTrace = {
    anchorTs: 1_700_000_000_000,
    anchorSgv: 123,
    slope: 0.4,
    points: [
      {tMin: -2, sgv: 110},
      {tMin: -1, sgv: 115},
      {tMin: 0, sgv: 123},
      {tMin: 1, sgv: 130},
    ],
    treatments30m: [
      {ts: 1_700_000_000_000 + 5 * ORACLE_MINUTE_MS, insulin: 1.25},
      {ts: 1_700_000_000_000 + 12 * ORACLE_MINUTE_MS, carbs: 18},
      // ignored: non-positive
      {ts: 1_700_000_000_000 + 20 * ORACLE_MINUTE_MS, carbs: 0, insulin: 0},
      // ignored: invalid ts
      {ts: Number.NaN, carbs: 10},
    ],
  };

  return {
    ...base,
    ...(overrides ?? {}),
  };
}

describe('oracleCgmGraphAdapter', () => {
  test('oracleMatchToCgmGraphData maps BG points to BgSample[] in time order', () => {
    const match = makeMatch();
    const data = oracleMatchToCgmGraphData(match);

    expect(data.bgSamples).toHaveLength(match.points.length);

    // preserves chronological ordering implied by tMin ascending
    for (let i = 1; i < data.bgSamples.length; i++) {
      expect(data.bgSamples[i].date).toBeGreaterThan(data.bgSamples[i - 1].date);
    }

    // timestamps align with anchorTs + tMin
    const expectedFirstTs = match.anchorTs + match.points[0].tMin * ORACLE_MINUTE_MS;
    expect(data.bgSamples[0].date).toBe(expectedFirstTs);
    expect(data.bgSamples[0].sgv).toBe(Math.round(match.points[0].sgv));

    // window bounds
    expect(data.windowStartMs).toBe(match.anchorTs - 120 * ORACLE_MINUTE_MS);
    expect(data.windowEndMs).toBe(match.anchorTs + 240 * ORACLE_MINUTE_MS);
  });

  test('oracleMatchToCgmGraphData maps treatments to foodItems + insulinData', () => {
    const match = makeMatch();
    const data = oracleMatchToCgmGraphData(match);

    expect(data.insulinData).toHaveLength(1);
    expect(data.insulinData[0]).toMatchObject({
      type: 'bolus',
      amount: 1.25,
      timestamp: new Date(match.anchorTs + 5 * ORACLE_MINUTE_MS).toISOString(),
    });

    expect(data.foodItems).toHaveLength(1);
    expect(data.foodItems[0]).toMatchObject({
      carbs: 18,
      timestamp: match.anchorTs + 12 * ORACLE_MINUTE_MS,
      name: 'Carbs',
    });

    // stable IDs help UI keying
    expect(typeof data.foodItems[0].id).toBe('string');
    expect(data.foodItems[0].id.length).toBeGreaterThan(10);
  });

  test('buildOracleMatchDetailsPayload wraps cgmGraph data and preserves anchor', () => {
    const match = makeMatch({anchorTs: 1_700_123_456_789});
    const payload = buildOracleMatchDetailsPayload(match);

    expect(payload.matchAnchorTs).toBe(match.anchorTs);
    expect(payload.bgSamples.length).toBeGreaterThan(0);
    expect(payload.windowStartMs).toBe(match.anchorTs - 120 * ORACLE_MINUTE_MS);
    expect(payload.windowEndMs).toBe(match.anchorTs + 240 * ORACLE_MINUTE_MS);
  });

  test('handles missing treatments30m', () => {
    const match = makeMatch({treatments30m: undefined});
    const data = oracleMatchToCgmGraphData(match);

    expect(data.foodItems).toEqual([]);
    expect(data.insulinData).toEqual([]);
  });
});
