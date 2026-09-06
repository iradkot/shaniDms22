import {fetchTreatmentsForDateRangeUncached} from '../../../api/apiRequests';
import {getNightscoutBaseUrl} from '../../../api/shaniNightscoutInstances';
import {
  JOURNAL_ERROR_CODES,
  areExactExternalDuplicates,
  decodeExternalRecordPayload,
  journalError,
  journalOk,
  toExternalRecordReference,
} from '../../../modules/journal';
import {
  deriveWorkspaceIdentity,
  sha1WorkspaceIdentityDigest,
} from '../../../modules/workspaces';
import type {
  ActivityExternalCandidate,
  FindActivityLinkCandidatesInput,
  FindMealLinkCandidatesInput,
  JournalExternalRecordReader,
  JournalResult,
  JournalWorkspaceScope,
  MealExternalCandidate,
  NightscoutSourceId,
  ReadLinkedExternalRecordInput,
  ReadLinkedExternalRecordResult,
} from '../../../modules/journal';

const DEFAULT_WINDOW_MS = 3 * 60 * 60 * 1000;
const LINK_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const MAX_ACTIVITY_DURATION_MINUTES = 7 * 24 * 60;

export interface NightscoutCandidateWindow {
  readonly startMs: number;
  readonly endMs: number;
}

export type NightscoutTreatmentLoader = (
  window: NightscoutCandidateWindow,
) => Promise<unknown>;

export interface NativeNightscoutExternalRecordReaderDependencies {
  readonly loadTreatments?: NightscoutTreatmentLoader;
  readonly assertActiveScope?: (scope: JournalWorkspaceScope) => void;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const timestampMs = (value: unknown): number | undefined => {
  const numeric = finiteNumber(value);
  if (numeric !== undefined && numeric > 0) {
    const milliseconds = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
    return Number.isSafeInteger(Math.trunc(milliseconds))
      ? Math.trunc(milliseconds)
      : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const eventTimestamp = (record: UnknownRecord): number | undefined =>
  timestampMs(record.date) ??
  timestampMs(record.mills) ??
  timestampMs(record.timestamp) ??
  timestampMs(record.created_at) ??
  timestampMs(record.createdAt);

const entryTimestamp = (record: UnknownRecord): number | undefined =>
  timestampMs(record.userCreatedDate) ??
  timestampMs(record.created_at) ??
  timestampMs(record.createdAt);

const optionalText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

const inWindow = (timestamp: number, window: NightscoutCandidateWindow) =>
  timestamp >= window.startMs && timestamp <= window.endMs;

const reasonFor = (timestamp: number, referenceMs: number): string => {
  const deltaMinutes = Math.round((timestamp - referenceMs) / 60_000);
  const sign = deltaMinutes > 0 ? '+' : '';
  return `Nightscout · Δ ${sign}${deltaMinutes} min`;
};

const recordReference = (
  value: UnknownRecord,
  sourceId: NightscoutSourceId,
) => {
  const decoded = decodeExternalRecordPayload(value, sourceId);
  if (!decoded.ok || decoded.value.identityStatus === 'unidentified') {
    return undefined;
  }
  const reference = toExternalRecordReference(decoded.value);
  return reference.ok ? reference.value : undefined;
};

const eventTypeOf = (record: UnknownRecord) => optionalText(record.eventType);
const enteredByOf = (record: UnknownRecord) => optionalText(record.enteredBy);

const uniqueByRecordIdentity = <
  TCandidate extends MealExternalCandidate | ActivityExternalCandidate,
>(
  candidates: readonly TCandidate[],
): readonly TCandidate[] => {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = candidate.record.recordKey as string;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const sortByReference = <
  TCandidate extends MealExternalCandidate | ActivityExternalCandidate,
>(
  candidates: readonly TCandidate[],
  referenceMs: number,
  timestampFor: (candidate: TCandidate) => number,
): readonly TCandidate[] =>
  [...candidates].sort((left, right) => {
    const leftTimestamp = timestampFor(left);
    const rightTimestamp = timestampFor(right);
    return (
      Math.abs(leftTimestamp - referenceMs) -
        Math.abs(rightTimestamp - referenceMs) ||
      leftTimestamp - rightTimestamp ||
      String(left.record.recordKey).localeCompare(
        String(right.record.recordKey),
      )
    );
  });

/**
 * Projects source facts only. Equal time/value records remain separate unless
 * they carry the exact same stable Nightscout identity.
 */
export const projectNightscoutMealCandidates = (
  values: readonly unknown[],
  sourceId: NightscoutSourceId,
  window: NightscoutCandidateWindow,
  referenceMs: number,
): readonly MealExternalCandidate[] => {
  const candidates: MealExternalCandidate[] = [];
  values.forEach(value => {
    if (!isRecord(value)) {
      return;
    }
    const timestamp = eventTimestamp(value);
    const reference = recordReference(value, sourceId);
    if (
      timestamp === undefined ||
      reference === undefined ||
      !inWindow(timestamp, window)
    ) {
      return;
    }
    const carbohydrates = finiteNumber(value.carbs);
    const eventType = eventTypeOf(value);
    const enteredBy = enteredByOf(value);
    const externalEntryTime = entryTimestamp(value);
    if (carbohydrates !== undefined && carbohydrates > 0) {
      candidates.push({
        kind: 'carbohydrate',
        record: reference,
        snapshot: {
          kind: 'carbohydrate',
          externalCarbTime: timestamp,
          ...(externalEntryTime === undefined ? {} : {externalEntryTime}),
          carbohydratesGrams: carbohydrates,
          ...(eventType === undefined ? {} : {eventType}),
          ...(enteredBy === undefined ? {} : {enteredBy}),
        },
        reason: reasonFor(timestamp, referenceMs),
      });
      return;
    }
    const insulin = finiteNumber(value.insulin);
    if (insulin === undefined || insulin <= 0) {
      return;
    }
    candidates.push({
      kind: 'treatment',
      record: reference,
      snapshot: {
        kind: 'treatment',
        treatmentTime: timestamp,
        ...(externalEntryTime === undefined ? {} : {externalEntryTime}),
        insulinUnits: insulin,
        ...(eventType === undefined ? {} : {eventType}),
        ...(enteredBy === undefined ? {} : {enteredBy}),
      },
      reason: reasonFor(timestamp, referenceMs),
    });
  });
  return sortByReference(
    uniqueByRecordIdentity(candidates),
    referenceMs,
    candidate =>
      candidate.kind === 'carbohydrate'
        ? candidate.snapshot.externalCarbTime
        : candidate.snapshot.treatmentTime,
  );
};

const isActivityEvent = (eventType: string | undefined): boolean =>
  eventType !== undefined &&
  /(exercise|activity|workout|sport)/i.test(eventType);

export const projectNightscoutActivityCandidates = (
  values: readonly unknown[],
  sourceId: NightscoutSourceId,
  window: NightscoutCandidateWindow,
  referenceMs: number,
): readonly ActivityExternalCandidate[] => {
  const candidates: ActivityExternalCandidate[] = [];
  values.forEach(value => {
    if (!isRecord(value)) {
      return;
    }
    const timestamp = eventTimestamp(value);
    const reference = recordReference(value, sourceId);
    if (
      timestamp === undefined ||
      reference === undefined ||
      !inWindow(timestamp, window)
    ) {
      return;
    }
    const eventType = eventTypeOf(value);
    const enteredBy = enteredByOf(value);
    const externalEntryTime = entryTimestamp(value);
    if (isActivityEvent(eventType)) {
      const durationMinutes = finiteNumber(value.duration);
      const validDuration =
        durationMinutes !== undefined &&
        durationMinutes >= 0 &&
        durationMinutes <= MAX_ACTIVITY_DURATION_MINUTES
          ? durationMinutes
          : undefined;
      candidates.push({
        kind: 'activity',
        record: reference,
        snapshot: {
          kind: 'activity',
          startedAt: timestamp,
          ...(validDuration === undefined
            ? {}
            : {endedAt: timestamp + validDuration * 60_000}),
          ...(eventType === undefined ? {} : {eventType}),
          ...(enteredBy === undefined ? {} : {enteredBy}),
        },
        reason: reasonFor(timestamp, referenceMs),
      });
      return;
    }
    const insulin = finiteNumber(value.insulin);
    if (insulin === undefined || insulin <= 0) {
      return;
    }
    candidates.push({
      kind: 'treatment',
      record: reference,
      snapshot: {
        kind: 'treatment',
        treatmentTime: timestamp,
        ...(externalEntryTime === undefined ? {} : {externalEntryTime}),
        insulinUnits: insulin,
        ...(eventType === undefined ? {} : {eventType}),
        ...(enteredBy === undefined ? {} : {enteredBy}),
      },
      reason: reasonFor(timestamp, referenceMs),
    });
  });
  return sortByReference(
    uniqueByRecordIdentity(candidates),
    referenceMs,
    candidate =>
      candidate.kind === 'activity'
        ? candidate.snapshot.startedAt
        : candidate.snapshot.treatmentTime,
  );
};

const defaultTreatmentLoader: NightscoutTreatmentLoader = async window => {
  return fetchTreatmentsForDateRangeUncached(
    new Date(window.startMs),
    new Date(window.endMs),
  );
};

const assertConfiguredSourceMatchesScope = (
  scope: JournalWorkspaceScope,
): void => {
  const baseUrl = getNightscoutBaseUrl();
  if (!baseUrl) {
    throw new Error('Nightscout is not configured.');
  }
  const identity = deriveWorkspaceIdentity(
    {firebaseUserId: scope.productUserId, nightscoutBaseUrl: baseUrl},
    sha1WorkspaceIdentityDigest,
  );
  if (
    !identity.ok ||
    identity.value.scope.nightscoutSourceId !== scope.nightscoutSourceId
  ) {
    throw new Error('The active Nightscout Source changed during the request.');
  }
};

const loadCandidates = async <TCandidate>(
  loader: NightscoutTreatmentLoader,
  scope: JournalWorkspaceScope,
  assertActiveScope: (scope: JournalWorkspaceScope) => void,
  window: NightscoutCandidateWindow,
  project: (records: readonly unknown[]) => readonly TCandidate[],
): Promise<JournalResult<readonly TCandidate[]>> => {
  try {
    assertActiveScope(scope);
    const value = await loader(window);
    assertActiveScope(scope);
    if (!Array.isArray(value)) {
      return journalError({
        code: JOURNAL_ERROR_CODES.SYNC_FAILED,
        message: 'Nightscout returned an invalid treatment response.',
        retryable: true,
      });
    }
    return journalOk(project(value));
  } catch {
    return journalError({
      code: JOURNAL_ERROR_CODES.OFFLINE,
      message: 'Nightscout treatment records are unavailable.',
      retryable: true,
    });
  }
};

const windowAround = (
  referenceMs: number,
  beforeMs: number | undefined,
  afterMs: number | undefined,
): NightscoutCandidateWindow => ({
  startMs: referenceMs - (beforeMs ?? DEFAULT_WINDOW_MS),
  endMs: referenceMs + (afterMs ?? DEFAULT_WINDOW_MS),
});

/** A strictly read-only Adapter; its dependency graph contains no write API. */
export const createNativeNightscoutExternalRecordReader = (
  dependencies: NativeNightscoutExternalRecordReaderDependencies = {},
): JournalExternalRecordReader => {
  const loader = dependencies.loadTreatments ?? defaultTreatmentLoader;
  const assertActiveScope =
    dependencies.assertActiveScope ?? assertConfiguredSourceMatchesScope;
  return {
    findMealCandidates(
      scope: JournalWorkspaceScope,
      input: FindMealLinkCandidatesInput,
    ) {
      const window = windowAround(
        input.nearMealStart,
        input.beforeMs,
        input.afterMs,
      );
      return loadCandidates(loader, scope, assertActiveScope, window, records =>
        projectNightscoutMealCandidates(
          records,
          scope.nightscoutSourceId,
          window,
          input.nearMealStart,
        ),
      );
    },
    findActivityCandidates(
      scope: JournalWorkspaceScope,
      input: FindActivityLinkCandidatesInput,
    ) {
      const window = windowAround(
        input.nearStartedAt,
        input.beforeMs,
        input.afterMs,
      );
      return loadCandidates(loader, scope, assertActiveScope, window, records =>
        projectNightscoutActivityCandidates(
          records,
          scope.nightscoutSourceId,
          window,
          input.nearStartedAt,
        ),
      );
    },
    async readLinkedRecord(
      scope: JournalWorkspaceScope,
      input: ReadLinkedExternalRecordInput,
    ): Promise<JournalResult<ReadLinkedExternalRecordResult>> {
      const referenceMs =
        input.lastKnown.kind === 'carbohydrate'
          ? input.lastKnown.externalCarbTime
          : input.lastKnown.kind === 'activity'
          ? input.lastKnown.startedAt
          : input.lastKnown.treatmentTime;
      const window = {
        startMs: referenceMs - LINK_REFRESH_WINDOW_MS,
        endMs: referenceMs + LINK_REFRESH_WINDOW_MS,
      };
      try {
        assertActiveScope(scope);
        const value = await loader(window);
        assertActiveScope(scope);
        if (!Array.isArray(value)) {
          return journalOk({kind: 'unavailable', reason: 'unknown'});
        }
        const exact =
          input.lastKnown.kind === 'activity'
            ? projectNightscoutActivityCandidates(
                value,
                scope.nightscoutSourceId,
                window,
                referenceMs,
              ).find(candidate =>
                areExactExternalDuplicates(candidate.record, input.record),
              )
            : projectNightscoutMealCandidates(
                value,
                scope.nightscoutSourceId,
                window,
                referenceMs,
              )
                .filter(candidate => candidate.kind === input.lastKnown.kind)
                .find(candidate =>
                  areExactExternalDuplicates(candidate.record, input.record),
                );
        return exact === undefined
          ? journalOk({kind: 'unavailable', reason: 'not_found'})
          : journalOk({
              kind: 'available',
              record: exact.record,
              snapshot: exact.snapshot,
            });
      } catch {
        return journalOk({
          kind: 'unavailable',
          reason: 'source_unavailable',
        });
      }
    },
  };
};
