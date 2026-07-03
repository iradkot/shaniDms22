import {
  buildDateRangeChunks,
  buildPreviousComparisonRange,
} from '../src/containers/MainTabsNavigator/Containers/Trends/utils/comparisonRanges';

describe('comparison range helpers', () => {
  it('builds a previous comparison range with full start and end days', () => {
    const range = buildPreviousComparisonRange({
      currentStart: new Date(2026, 6, 3),
      rangeDays: 7,
      offsetDays: 7,
    });

    expect(localDateParts(range.start)).toEqual([2026, 5, 26, 0, 0, 0, 0]);
    expect(localDateParts(range.end)).toEqual([2026, 6, 2, 23, 59, 59, 999]);
  });

  it('keeps chunk end dates at end of day', () => {
    const chunks = buildDateRangeChunks(
      {
        start: new Date(2026, 5, 26, 0, 0, 0, 0),
        end: new Date(2026, 6, 2, 23, 59, 59, 999),
      },
      7,
    );

    expect(chunks).toHaveLength(1);
    expect(localDateParts(chunks[0].start)).toEqual([2026, 5, 26, 0, 0, 0, 0]);
    expect(localDateParts(chunks[0].end)).toEqual([
      2026,
      6,
      2,
      23,
      59,
      59,
      999,
    ]);
  });
});

function localDateParts(date: Date) {
  return [
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  ];
}
