import type {InsulinDataEntry} from 'app/types/insulin.types';
import {buildCarbEvents, type CarbEvent} from './carbsUtils';

type BolusEvent = InsulinDataEntry & {
  type: 'bolus';
  amount: number;
  timestamp: string;
};
type TimedEvent<T> = {event: T; timeMs: number; sourceOrder: number};

/** Source preparation belongs to the immutable data lifecycle, not cursor moves. */
function createTimeIndex<T>(
  events: TimedEvent<T>[],
  preferSourceOrderOnTie = false,
) {
  events.sort((left, right) => left.timeMs - right.timeMs);
  const lowerBound = (timeMs: number) => {
    let low = 0;
    let high = events.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (events[middle]!.timeMs < timeMs) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  };

  return {
    closestTime(timeMs: number, maxDistanceMs: number): number | null {
      if (!Number.isFinite(timeMs)) {
        return null;
      }
      const position = lowerBound(timeMs);
      const right = events[position];
      // With equal-time records, preserve the first original source record.
      const left =
        position > 0
          ? events[lowerBound(events[position - 1]!.timeMs)]
          : undefined;
      let closest = left ?? right;
      if (left && right) {
        const leftDistance = timeMs - left.timeMs;
        const rightDistance = right.timeMs - timeMs;
        if (
          rightDistance < leftDistance ||
          (rightDistance === leftDistance &&
            preferSourceOrderOnTie &&
            right.sourceOrder < left.sourceOrder)
        ) {
          closest = right;
        }
      }
      return closest && Math.abs(closest.timeMs - timeMs) <= maxDistanceMs
        ? closest.timeMs
        : null;
    },
    within(timeMs: number, radiusMs: number, limit = Infinity): T[] {
      // Windows must be bounded. Only the result count may be unlimited.
      const validLimit =
        limit === Infinity || (Number.isInteger(limit) && limit >= 0);
      if (
        !Number.isFinite(timeMs) ||
        !Number.isFinite(radiusMs) ||
        radiusMs < 0 ||
        !validLimit
      ) {
        return [];
      }
      const matches: T[] = [];
      for (
        let index = lowerBound(timeMs - radiusMs);
        index < events.length;
        index++
      ) {
        const item = events[index]!;
        if (item.timeMs > timeMs + radiusMs || matches.length >= limit) {
          break;
        }
        matches.push(item.event);
      }
      return matches;
    },
  };
}

export function createBolusTooltipIndex(
  insulinData: readonly InsulinDataEntry[] | undefined,
  domain?: readonly [Date, Date] | null,
) {
  const startMs = domain ? +domain[0] : -Infinity;
  const endMs = domain ? +domain[1] : Infinity;
  const events: TimedEvent<BolusEvent>[] = [];
  for (const [sourceOrder, event] of (insulinData ?? []).entries()) {
    if (
      event.type !== 'bolus' ||
      typeof event.amount !== 'number' ||
      !Number.isFinite(event.amount) ||
      event.amount <= 0
    ) {
      continue;
    }
    const timestamp = event.timestamp;
    if (typeof timestamp !== 'string') {
      continue;
    }
    const timeMs = Date.parse(timestamp);
    if (Number.isFinite(timeMs) && timeMs >= startMs && timeMs <= endMs) {
      events.push({event: event as BolusEvent, timeMs, sourceOrder});
    }
  }
  return createTimeIndex(events, true);
}

export function createCarbTooltipIndex(
  foodItems: readonly CarbEvent[] | null,
  domain?: readonly [Date, Date] | null,
) {
  return createTimeIndex(
    buildCarbEvents(foodItems, domain).map((event, sourceOrder) => ({
      event,
      timeMs: event.timestamp,
      sourceOrder,
    })),
  );
}
