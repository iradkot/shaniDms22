import {
  CORE_DESTINATION_IDS,
  DESTINATION_GROUPS,
  DestinationLocale,
  DestinationRegistry,
  DestinationUnavailableCode,
  ResolvedDestinationTarget,
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

export const HUB_RECENT_LIMIT = 8;

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
  const destinations = dedupeResolved(
    ordered.map(recent =>
      resolveDestinationTarget(
        registry,
        recent.target,
        'recent',
        input.runtime,
      ),
    ),
  );
  const limited = destinations.slice(
    0,
    Math.max(0, input.recentLimit ?? HUB_RECENT_LIMIT),
  );
  return limited.map(resolved =>
    makeItem(resolved, input.locale, input.operationalBadges),
  );
};

export const selectAllModuleGroups = (
  registry: DestinationRegistry,
  input: SelectHubModelInput,
): readonly HubModuleGroup[] => {
  const hidden = input.preferences.hiddenModuleIds ?? new Set<string>();
  return DESTINATION_GROUPS.map(groupId => ({
    id: groupId,
    title: GROUP_COPY[groupId][input.locale],
    items: registry.destinations
      .filter(destination => {
        const owner = registry.get(destination.ownerModuleId);
        return (
          owner?.kind === 'module' &&
          owner.group === groupId &&
          !hidden.has(destination.id) &&
          !hidden.has(owner.id) &&
          (destination.kind === 'module' || destination.targetPolicy.shortcut)
        );
      })
      .sort((left, right) => left.order - right.order)
      .map(destination =>
        makeItem(
          resolveDestinationTarget(
            registry,
            createStoredDestinationTarget(destination.id),
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
