import type {DayGraphDataSource} from '../../modules/dayGraph';
import {
  buildEventOutcome,
  type EventOutcome,
  type EventOutcomeContextEvent,
  type EventOutcomeSubject,
} from '../../modules/eventOutcomes';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const contextKind = (
  kind: 'treatment' | 'external-carb' | 'journal-meal' | 'journal-activity',
): EventOutcomeContextEvent['kind'] => {
  switch (kind) {
    case 'treatment':
      return 'treatment';
    case 'external-carb':
      return 'carbohydrate';
    case 'journal-meal':
      return 'meal';
    case 'journal-activity':
      return 'activity';
  }
};

/** Reuses the factual Day Graph seam instead of adding another Nightscout API. */
export const loadEventOutcomeFromDayGraph = async (input: {
  readonly dataSource: DayGraphDataSource;
  readonly subject: EventOutcomeSubject;
  readonly expectedSampleIntervalMs?: number;
}): Promise<EventOutcome> => {
  const expectedSampleIntervalMs =
    input.expectedSampleIntervalMs ?? 5 * MINUTE_MS;
  const subjectEndMs = input.subject.endedAtMs ?? input.subject.startedAtMs;
  const period = {
    dayStartMs: input.subject.startedAtMs - 30 * MINUTE_MS,
    dayEndMs:
      subjectEndMs +
      (input.subject.kind === 'meal' ? 3 * HOUR_MS : 2 * HOUR_MS) +
      1,
  };
  const snapshot = await input.dataSource.loadDayGraph(period);
  return buildEventOutcome({
    subject: input.subject,
    expectedSampleIntervalMs,
    glucoseSamples: snapshot.glucoseSamples.map(sample => ({
      timestampMs: sample.timestampMs,
      valueMgDl: sample.valueMgDl,
    })),
    contextEvents: snapshot.timelineItems.map(item => ({
      id: `${item.identity.sourceId}:${item.identity.recordId}`,
      kind: contextKind(item.kind),
      timestampMs: item.timestampMs,
      ...(item.kind === 'journal-activity' &&
      item.endTimestampMs !== undefined
        ? {endTimestampMs: item.endTimestampMs}
        : {}),
      label: item.title,
      relatedToSubject:
        item.identity.sourceId === 'journal' &&
        item.identity.recordId === input.subject.id,
    })),
  });
};
