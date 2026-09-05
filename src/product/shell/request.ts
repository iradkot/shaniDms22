import type {AvailableDestinationTarget} from '../destinations';
import type {DestinationFocus, DestinationRequest} from './types';

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ownKeysAre = (
  value: UnknownRecord,
  allowed: readonly string[],
): boolean => Object.keys(value).every(key => allowed.includes(key));

const nonEmptyId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 512 ? trimmed : undefined;
};

const timestamp = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;

const invalid = (message: string): never => {
  throw new DestinationRequestValidationError(message);
};

const parseFocus = (value: unknown): DestinationFocus => {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return invalid('Destination focus must be a typed object.');
  }
  switch (value.kind) {
    case 'day': {
      const dayStartMs = timestamp(value.dayStartMs);
      const atMs = value.atMs === undefined ? undefined : timestamp(value.atMs);
      if (
        !ownKeysAre(value, ['kind', 'dayStartMs', 'atMs']) ||
        !dayStartMs ||
        (value.atMs !== undefined &&
          (atMs === undefined ||
            atMs < dayStartMs ||
            atMs >= dayStartMs + 27 * 3600000))
      ) {
        return invalid('Day focus needs one valid day boundary.');
      }
      return {kind: 'day', dayStartMs, ...(atMs === undefined ? {} : {atMs})};
    }
    case 'period': {
      const startMs = timestamp(value.startMs);
      const endMs = timestamp(value.endMs);
      if (
        !ownKeysAre(value, ['kind', 'startMs', 'endMs']) ||
        !startMs ||
        !endMs ||
        endMs <= startMs
      ) {
        return invalid('Period focus needs increasing valid boundaries.');
      }
      return {kind: 'period', startMs, endMs};
    }
    case 'journal-entry': {
      const entryId = nonEmptyId(value.entryId);
      if (
        !ownKeysAre(value, ['kind', 'entryKind', 'entryId']) ||
        (value.entryKind !== 'meal' && value.entryKind !== 'activity') ||
        !entryId
      ) {
        return invalid('Journal focus needs a supported kind and entry ID.');
      }
      return {kind: 'journal-entry', entryKind: value.entryKind, entryId};
    }
    case 'external-record': {
      const recordId = nonEmptyId(value.recordId);
      if (
        !ownKeysAre(value, ['kind', 'recordKind', 'recordId']) ||
        (value.recordKind !== 'carbohydrate' &&
          value.recordKind !== 'treatment' &&
          value.recordKind !== 'activity') ||
        !recordId
      ) {
        return invalid(
          'External-record focus needs a supported kind and record ID.',
        );
      }
      return {
        kind: 'external-record',
        recordKind: value.recordKind,
        recordId,
      };
    }
    case 'alert-occurrence': {
      const occurrenceId = nonEmptyId(value.occurrenceId);
      if (!ownKeysAre(value, ['kind', 'occurrenceId']) || !occurrenceId) {
        return invalid('Alert focus needs an occurrence ID.');
      }
      return {kind: 'alert-occurrence', occurrenceId};
    }
    case 'loop-change': {
      const changeId = nonEmptyId(value.changeId);
      if (!ownKeysAre(value, ['kind', 'changeId']) || !changeId) {
        return invalid('Loop-change focus needs a change ID.');
      }
      return {kind: 'loop-change', changeId};
    }
    case 'ai-conversation': {
      const conversationId = nonEmptyId(value.conversationId);
      if (!ownKeysAre(value, ['kind', 'conversationId']) || !conversationId) {
        return invalid('AI focus needs a conversation ID.');
      }
      return {kind: 'ai-conversation', conversationId};
    }
    default:
      return invalid('Destination focus kind is not supported.');
  }
};

export class DestinationRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DestinationRequestValidationError';
  }
}

/**
 * Runtime-validates context arriving from notification/deep-link adapters.
 * The returned request remains in memory and must never cross persistence.
 */
export const createDestinationRequest = (
  destination: AvailableDestinationTarget,
  untrustedOptions: unknown = {},
): DestinationRequest => {
  if (
    !isRecord(untrustedOptions) ||
    !ownKeysAre(untrustedOptions, ['workspaceId', 'focus'])
  ) {
    return invalid('Destination request options contain unsupported fields.');
  }
  const workspaceId =
    untrustedOptions.workspaceId === undefined
      ? undefined
      : nonEmptyId(untrustedOptions.workspaceId);
  if (untrustedOptions.workspaceId !== undefined && workspaceId === undefined) {
    return invalid('Destination request needs a valid Workspace ID.');
  }
  const focus =
    untrustedOptions.focus === undefined
      ? undefined
      : parseFocus(untrustedOptions.focus);
  return {
    destination,
    ...(workspaceId === undefined ? {} : {workspaceId}),
    ...(focus === undefined ? {} : {focus}),
  };
};
