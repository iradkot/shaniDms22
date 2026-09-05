import {
  CORE_DESTINATION_IDS,
  DESTINATION_GROUPS,
  DestinationDefinition,
  DestinationLocale,
  DestinationRegistry,
  DestinationUnavailableCode,
  ResolvedDestinationTarget,
  StoredDestinationTarget,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from '../destinations';
import {
  HubItem,
  HubModuleGroup,
  HubViewModel,
  OperationalBadge,
  SelectHubModelInput,
} from './types';

const GROUP_COPY: Record<
  HubModuleGroup['id'],
  Readonly<Record<DestinationLocale, string>>
> = {
  today: {en: 'Today', he: 'היום'},
  understand: {en: 'Understand', he: 'להבין'},
  ask: {en: 'Ask', he: 'לשאול'},
  record: {en: 'Record', he: 'לתעד'},
  updates: {en: 'Updates', he: 'עדכונים'},
  manage: {en: 'Manage', he: 'ניהול'},
};

const UNKNOWN_COPY: Readonly<
  Record<DestinationLocale, {title: string; description: string}>
> = {
  en: {
    title: 'Unavailable destination',
    description: 'This saved destination is not installed on this device.',
  },
  he: {
    title: 'יעד לא זמין',
    description: 'היעד השמור אינו מותקן במכשיר הזה.',
  },
};

const UNAVAILABLE_REASON_COPY: Readonly<
  Record<
    DestinationUnavailableCode,
    Readonly<Record<DestinationLocale, string>>
  >
> = {
  'unknown-destination': {
    en: 'It is no longer installed.',
    he: 'הוא אינו מותקן יותר.',
  },
  'unsupported-platform': {
    en: 'It is not available on this device.',
    he: 'הוא אינו זמין במכשיר הזה.',
  },
  'missing-capability': {
    en: 'A required connection or permission is missing.',
    he: 'חסרים חיבור או הרשאה נדרשים.',
  },
  disabled: {
    en: 'It is temporarily unavailable.',
    he: 'הוא אינו זמין באופן זמני.',
  },
  'target-not-allowed': {
    en: 'It cannot be used here.',
    he: 'לא ניתן להשתמש בו כאן.',
  },
};

const makeItem = (
  resolved: ResolvedDestinationTarget,
  locale: DestinationLocale,
  badges?: ReadonlyMap<string, OperationalBadge>,
): HubItem => {
  const destination = resolved.destination;
  const copy = destination?.copy[locale] ?? UNKNOWN_COPY[locale];
  const unavailableReason =
    resolved.status === 'unavailable'
      ? resolved.reason.code === 'disabled' && resolved.reason.message
        ? resolved.reason.message
        : UNAVAILABLE_REASON_COPY[resolved.reason.code][locale]
      : '';
  const unavailableDescription = `${copy.description} ${unavailableReason}`;

  const operationalBadge = destination
    ? badges?.get(destination.id)
    : undefined;
  return {
    key: destination?.id ?? resolved.target.destinationId,
    title: copy.title,
    description:
      resolved.status === 'unavailable'
        ? unavailableDescription.trim()
        : copy.description,
    resolved,
    ...(operationalBadge === undefined ? {} : {operationalBadge}),
  };
};

const resolvedIdentity = (resolved: ResolvedDestinationTarget): string =>
  resolved.destination?.id ?? resolved.target.destinationId;

const dedupeResolved = (
  values: readonly ResolvedDestinationTarget[],
): readonly ResolvedDestinationTarget[] => {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = resolvedIdentity(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const resolveOwnerModule = (
  registry: DestinationRegistry,
  resolved: ResolvedDestinationTarget,
  input: SelectHubModelInput,
): ResolvedDestinationTarget => {
  if (resolved.status !== 'available') {
    return resolved;
  }
  const ownerId = resolved.destination.ownerModuleId;
  return resolveDestinationTarget(
    registry,
    createStoredDestinationTarget(ownerId),
    undefined,
    input.runtime,
  );
};

export const selectFavoriteItems = (
  registry: DestinationRegistry,
  input: SelectHubModelInput,
): readonly HubItem[] =>
  dedupeResolved(
    input.preferences.favorites.map(target =>
      resolveDestinationTarget(registry, target, 'favorite', input.runtime),
    ),
  ).map(resolved => makeItem(resolved, input.locale, input.operationalBadges));

export const selectRecentItems = (
  registry: DestinationRegistry,
  input: SelectHubModelInput,
): readonly HubItem[] => {
  const ordered = [...(input.preferences.recents ?? [])].sort(
    (left, right) => right.visitedAt - left.visitedAt,
  );
  const ownerModules = dedupeResolved(
    ordered.map(recent =>
      resolveOwnerModule(
        registry,
        resolveDestinationTarget(
          registry,
          recent.target,
          undefined,
          input.runtime,
        ),
        input,
      ),
    ),
  );
  const limited = ownerModules.slice(0, Math.max(0, input.recentLimit ?? 4));
  return limited.map(resolved =>
    makeItem(resolved, input.locale, input.operationalBadges),
  );
};

const moduleTarget = (
  destination: DestinationDefinition,
): StoredDestinationTarget => createStoredDestinationTarget(destination.id);

export const selectAllModuleGroups = (
  registry: DestinationRegistry,
  input: SelectHubModelInput,
): readonly HubModuleGroup[] => {
  const hidden = input.preferences.hiddenModuleIds ?? new Set<string>();
  return DESTINATION_GROUPS.map(groupId => ({
    id: groupId,
    title: GROUP_COPY[groupId][input.locale],
    items: registry
      .modules(groupId)
      .filter(module => !hidden.has(module.id))
      .map(module =>
        makeItem(
          resolveDestinationTarget(
            registry,
            moduleTarget(module),
            undefined,
            input.runtime,
          ),
          input.locale,
          input.operationalBadges,
        ),
      ),
  })).filter(group => group.items.length > 0);
};

export const selectHubViewModel = (
  registry: DestinationRegistry,
  input: SelectHubModelInput,
): HubViewModel => ({
  locale: input.locale,
  direction: input.locale === 'he' ? 'rtl' : 'ltr',
  favorites: selectFavoriteItems(registry, input),
  recents: selectRecentItems(registry, input),
  groups: selectAllModuleGroups(registry, input),
});

export const selectCurrentSnapshotTarget = (
  registry: DestinationRegistry,
  input: Pick<SelectHubModelInput, 'runtime'>,
): ResolvedDestinationTarget =>
  resolveDestinationTarget(
    registry,
    createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph),
    undefined,
    input.runtime,
  );
