import {
  DestinationLocale,
  DestinationRuntimeContext,
  ResolvedDestinationTarget,
  StoredDestinationTarget,
} from '../destinations';

export type OperationalBadgeTone = 'neutral' | 'attention' | 'warning';

/** Small operational state only: update count, pending sync, stale, or offline. */
export interface OperationalBadge {
  readonly label: string;
  readonly tone?: OperationalBadgeTone;
}

export interface RecentDestination {
  readonly target: StoredDestinationTarget;
  readonly visitedAt: number;
}

export interface HubPreferences {
  readonly favorites: readonly StoredDestinationTarget[];
  readonly recents?: readonly RecentDestination[];
  readonly hiddenModuleIds?: ReadonlySet<string>;
}

export interface HubItem {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly resolved: ResolvedDestinationTarget;
  readonly operationalBadge?: OperationalBadge;
}

export interface HubModuleGroup {
  readonly id: 'today' | 'understand' | 'ask' | 'record' | 'updates' | 'manage';
  readonly title: string;
  readonly items: readonly HubItem[];
}

export interface HubViewModel {
  readonly locale: DestinationLocale;
  readonly direction: 'ltr' | 'rtl';
  readonly favorites: readonly HubItem[];
  readonly recents: readonly HubItem[];
  readonly groups: readonly HubModuleGroup[];
}

export interface SelectHubModelInput {
  readonly locale: DestinationLocale;
  readonly runtime: DestinationRuntimeContext;
  readonly preferences: HubPreferences;
  readonly operationalBadges?: ReadonlyMap<string, OperationalBadge>;
  readonly recentLimit?: number;
}

export type CurrentSnapshotStatus =
  | 'loading'
  | 'ready'
  | 'stale'
  | 'offline'
  | 'empty';

/**
 * Already-formatted display values supplied by the data adapter.
 * The Hub owns presentation only and performs no glucose calculations.
 */
export interface CurrentSnapshotViewModel {
  readonly status: CurrentSnapshotStatus;
  readonly target: ResolvedDestinationTarget;
  readonly glucoseLabel?: string;
  readonly trendLabel?: string;
  readonly dataAgeLabel?: string;
  readonly iobLabel?: string;
  readonly cobLabel?: string;
  readonly message?: string;
}
