import {parseNightscoutTimestampMs} from 'app/utils/nightscoutTimestamp';

describe('Nightscout timestamp contract', () => {
  const midnight = Date.parse('2026-09-27T00:00:00Z');

  it.each([
    midnight,
    String(midnight),
    '2026-09-27T00:00:00Z',
    '2026-09-27T05:30:00+05:30',
    '2026-09-27T05:30:00+0530',
    '2026-09-27T03:00:00+03',
  ])('normalizes supported source timestamp %s', value => {
    expect(parseNightscoutTimestampMs(value)).toBe(midnight);
  });

  it('interprets fractional seconds consistently at millisecond precision', () => {
    expect(parseNightscoutTimestampMs('2026-09-27T00:00:00.1Z')).toBe(
      midnight + 100,
    );
    expect(parseNightscoutTimestampMs('2026-09-27T00:00:00.123456Z')).toBe(
      midnight + 123,
    );
  });

  it.each([
    '2026-02-31T00:00:00Z',
    '2026-09-27T24:00:00Z',
    '2026-09-27T00:00:00+24:00',
    '2026-09-27T00:00:00Zgarbage',
    '2026-09-27',
    0,
    NaN,
    Infinity,
    8.64e15 + 1,
  ])('rejects invalid or ambiguous source timestamp %s', value => {
    expect(parseNightscoutTimestampMs(value)).toBeNaN();
  });
});
