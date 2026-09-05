import type {JournalWorkspaceScope} from '../../domain/journal';

const component = (value: string): string => encodeURIComponent(value);

export const journalScopeStorageKey = (scope: JournalWorkspaceScope): string =>
  `journal:v1:${component(scope.productUserId)}:${component(
    scope.workspaceId,
  )}:${component(scope.nightscoutSourceId)}`;
