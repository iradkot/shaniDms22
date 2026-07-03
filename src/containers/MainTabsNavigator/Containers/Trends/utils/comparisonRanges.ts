export interface DateRange {
  start: Date;
  end: Date;
}

export const startOfDay = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

export const endOfDay = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
};

export const buildPreviousComparisonRange = ({
  currentStart,
  rangeDays,
  offsetDays,
}: {
  currentStart: Date;
  rangeDays: number;
  offsetDays: number;
}): DateRange => {
  const start = startOfDay(currentStart);
  start.setDate(start.getDate() - offsetDays);

  const end = endOfDay(start);
  end.setDate(start.getDate() + (rangeDays - 1));

  return {start, end};
};

export const buildDateRangeChunks = (
  range: DateRange,
  chunkSize: number,
): DateRange[] => {
  const totalDays = Math.max(
    1,
    Math.floor(
      (startOfDay(range.end).getTime() - startOfDay(range.start).getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1,
  );
  const totalChunks = Math.ceil(totalDays / chunkSize);

  return Array.from({length: totalChunks}, (_, i) => {
    const chunkStart = startOfDay(range.start);
    chunkStart.setDate(chunkStart.getDate() + i * chunkSize);

    const chunkEnd = endOfDay(chunkStart);
    chunkEnd.setDate(chunkStart.getDate() + chunkSize - 1);
    if (chunkEnd.getTime() > range.end.getTime()) {
      chunkEnd.setTime(range.end.getTime());
    }

    return {start: chunkStart, end: chunkEnd};
  });
};
