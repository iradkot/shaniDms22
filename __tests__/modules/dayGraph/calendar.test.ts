import {
  buildDayGraphCalendar,
  moveLocalDays,
  periodForLocalMonth,
  startOfLocalDay,
  type DayGraphCalendarSnapshot,
} from 'app/modules/dayGraph';

// Jest runs in Node; keep its environment type local instead of adding Node
// globals to the shared native/Web TypeScript project.
declare const process: {readonly env: {readonly TZ?: string}};

const minute = 60_000;
const day = new Date(2026, 8, 7).getTime();
const snapshot = (
  values: readonly [number, number][],
  complete = true,
): DayGraphCalendarSnapshot => ({
  complete,
  freshness: {kind: 'fresh', fetchedAtMs: day},
  glucoseSamples: values.map(([timestampMs, valueMgDl], index) => ({
    identity: {sourceId: 'fixture', recordId: String(index)},
    timestampMs,
    valueMgDl,
  })),
});
const build = (
  data?: DayGraphCalendarSnapshot,
  nowMs = moveLocalDays(day, 2),
) => buildDayGraphCalendar({monthStartMs: day, nowMs, snapshot: data});

describe('Day graph calendar summaries', () => {
  it('uses existing inclusive target buckets, deduplication and valid readings only', () => {
    const result = build(
      snapshot([
        [day, 70],
        [day + minute, 180],
        [day + 2 * minute, 181],
        [day + 3 * minute, 69],
        [day + minute, 999],
        [day + 4 * minute, NaN],
        [day + 5 * minute, -1],
        [NaN, 100],
      ]),
    ).find(item => item.dayStartMs === day)!;
    expect(result).toMatchObject({
      status: 'data',
      timeInRangePct: 50,
      partial: true,
    });
    expect(result.coveragePct).toBeCloseTo((8 / 1440) * 100, 2);
  });

  it('honors configured target bounds instead of assuming 70–180', () => {
    const result = buildDayGraphCalendar({
      monthStartMs: day,
      nowMs: moveLocalDays(day, 1),
      thresholds: {
        veryLowMaxMgDl: 54,
        targetMinMgDl: 80,
        targetMaxMgDl: 150,
        highMaxMgDl: 250,
      },
      snapshot: snapshot([
        [day, 70],
        [day + minute, 150],
        [day + 2 * minute, 180],
      ]),
    }).find(item => item.dayStartMs === day)!;
    expect(result.timeInRangePct).toBe(33.33);
  });

  it('distinguishes zero TIR, confirmed empty, unknown, and future days', () => {
    const result = build(snapshot([[day, 200]]));
    expect(result.find(item => item.dayStartMs === day)).toMatchObject({
      status: 'data',
      timeInRangePct: 0,
    });
    expect(
      result.find(item => item.dayStartMs === moveLocalDays(day, -1)),
    ).toMatchObject({status: 'empty', timeInRangePct: null});
    expect(
      result.find(item => item.dayStartMs === moveLocalDays(day, 3)),
    ).toMatchObject({status: 'unknown', timeInRangePct: null});
    expect(build().every(item => item.status === 'unknown')).toBe(true);
    expect(
      build(snapshot([], false)).every(item => item.status === 'unknown'),
    ).toBe(true);
    expect(
      build({
        ...snapshot([]),
        freshness: {kind: 'stale', fetchedAtMs: day},
      }).every(item => item.status === 'unknown'),
    ).toBe(true);
  });

  it('keeps a sparse 100% day explicitly partial and treats today as unfinished', () => {
    expect(
      build(snapshot([[day, 120]])).find(item => item.dayStartMs === day),
    ).toMatchObject({timeInRangePct: 100, partial: true});
    const samples = Array.from({length: 144}, (_, i): [number, number] => [
      day + i * 5 * minute,
      120,
    ]);
    const result = build(
      snapshot([...samples, [day + 13 * 60 * minute, 300]]),
      day + 12 * 60 * minute - 1,
    ).find(item => item.dayStartMs === day)!;
    expect(result).toMatchObject({
      timeInRangePct: 100,
      coveragePct: 100,
      partial: true,
    });
  });

  it('does not show adequate complete historical readings as partial', () => {
    const samples = Array.from({length: 288}, (_, i): [number, number] => [
      day + i * 5 * minute,
      120,
    ]);
    expect(
      build(snapshot(samples)).find(item => item.dayStartMs === day),
    ).toMatchObject({timeInRangePct: 100, coveragePct: 100, partial: false});
    expect(
      build(snapshot(samples, false)).find(item => item.dayStartMs === day)
        ?.partial,
    ).toBe(true);
  });

  it('does not let a dense burst of one-minute readings conceal the missing rest of the day', () => {
    const samples = Array.from({length: 300}, (_, i): [number, number] => [
      day + i * minute,
      120,
    ]);
    const result = build(snapshot(samples)).find(
      item => item.dayStartMs === day,
    )!;
    expect(result).toMatchObject({timeInRangePct: 100, partial: true});
    expect(result.coveragePct).toBeLessThan(22);
  });

  it('uses half-open local days and leap-year month lengths', () => {
    const leap = new Date(2024, 1, 10).getTime();
    const period = periodForLocalMonth(leap);
    expect(new Date(period.dayStartMs).getDate()).toBe(1);
    expect(new Date(period.dayEndMs).getMonth()).toBe(2);
    expect(
      buildDayGraphCalendar({monthStartMs: leap, nowMs: day}),
    ).toHaveLength(29);
    const result = build(snapshot([[moveLocalDays(day, 1), 120]]));
    expect(result.find(item => item.dayStartMs === day)?.status).toBe('empty');
    expect(
      result.find(item => item.dayStartMs === moveLocalDays(day, 1))?.status,
    ).toBe('data');
    expect(startOfLocalDay(day + 15 * 60 * minute)).toBe(day);
  });

  it('calculates coverage using actual local-day duration, including DST', () => {
    for (const date of [new Date(2026, 2, 8), new Date(2026, 10, 1)]) {
      const start = date.getTime();
      const end = moveLocalDays(start, 1);
      // yarn test:calendar starts a fresh Node process in this zone. Assert
      // the actual duration so an ignored TZ cannot silently skip DST coverage.
      if (process.env.TZ === 'America/New_York') {
        expect((end - start) / 3_600_000).toBe(date.getMonth() === 2 ? 23 : 25);
      }
      const samples: [number, number][] = [];
      for (let time = start; time < end; time += 5 * minute) {
        samples.push([time, 120]);
      }
      const result = buildDayGraphCalendar({
        monthStartMs: start,
        nowMs: end,
        snapshot: snapshot(samples),
      });
      expect(result.find(item => item.dayStartMs === start)).toMatchObject({
        coveragePct: 100,
        partial: false,
      });
    }
  });
});
