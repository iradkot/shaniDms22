import {CORE_DESTINATION_IDS, CORE_DESTINATIONS} from '../destinations';
import type {HubItem, HubModuleGroup} from './types';

export interface HubVisual {
  readonly accent: string;
  readonly border: string;
  readonly iconBackground: string;
  readonly iconName: string;
  readonly surface: string;
}

const GROUP_VISUALS: Readonly<Record<HubModuleGroup['id'], HubVisual>> = {
  today: {
    accent: '#2563EB',
    border: '#BFDBFE',
    iconBackground: '#DBEAFE',
    iconName: 'today',
    surface: '#EFF6FF',
  },
  understand: {
    accent: '#6D28D9',
    border: '#DDD6FE',
    iconBackground: '#EDE9FE',
    iconName: 'insights',
    surface: '#F5F3FF',
  },
  ask: {
    accent: '#A21CAF',
    border: '#F0ABFC',
    iconBackground: '#FAE8FF',
    iconName: 'auto-awesome',
    surface: '#FDF4FF',
  },
  record: {
    accent: '#0F766E',
    border: '#99F6E4',
    iconBackground: '#CCFBF1',
    iconName: 'add-circle-outline',
    surface: '#F0FDFA',
  },
  updates: {
    accent: '#C2410C',
    border: '#FED7AA',
    iconBackground: '#FFEDD5',
    iconName: 'notifications-active',
    surface: '#FFF7ED',
  },
  manage: {
    accent: '#475569',
    border: '#CBD5E1',
    iconBackground: '#E2E8F0',
    iconName: 'tune',
    surface: '#F8FAFC',
  },
};

const FALLBACK_VISUAL: HubVisual = {
  accent: '#475569',
  border: '#CBD5E1',
  iconBackground: '#E2E8F0',
  iconName: 'apps',
  surface: '#F8FAFC',
};

type CoreDestinationKey = keyof typeof CORE_DESTINATION_IDS;

const DESTINATION_ICONS_BY_KEY: Readonly<
  Record<CoreDestinationKey, string>
> = {
  dayGraph: 'show-chart',
  dailyOverview: 'dashboard',
  previousDaySummary: 'history',
  trends: 'trending-up',
  trendsOverview: 'insights',
  trendsAgpDailyPatterns: 'stacked-line-chart',
  trendsComparePeriods: 'compare-arrows',
  trendsTherapyContext: 'fact-check',
  hypoInvestigation: 'search',
  similarEvents: 'content-copy',
  loopChangesImpact: 'tune',
  aiAnalyst: 'auto-awesome',
  aiGeneralChat: 'chat',
  aiHypoSpecialist: 'medical-services',
  aiBehaviorSpecialist: 'psychology',
  aiLoopSpecialist: 'settings-suggest',
  aiMealSpecialist: 'restaurant',
  meals: 'restaurant-menu',
  activity: 'directions-run',
  updateCenter: 'notifications',
  alertRules: 'notifications-active',
  settings: 'settings',
};

const DESTINATION_ICONS: ReadonlyMap<string, string> = new Map(
  (Object.keys(CORE_DESTINATION_IDS) as CoreDestinationKey[]).map(key => [
    CORE_DESTINATION_IDS[key],
    DESTINATION_ICONS_BY_KEY[key],
  ]),
);

const MODULE_GROUP_BY_ID = new Map<string, HubModuleGroup['id']>();
CORE_DESTINATIONS.forEach(destination => {
  if (destination.kind === 'module') {
    MODULE_GROUP_BY_ID.set(destination.id, destination.group);
  }
});

const destinationGroup = (item: HubItem): HubModuleGroup['id'] | undefined => {
  const destination = item.resolved.destination;
  if (!destination) {
    return undefined;
  }
  return destination.kind === 'module'
    ? destination.group
    : MODULE_GROUP_BY_ID.get(destination.ownerModuleId);
};

/**
 * The Hub's single visual seam. Product code supplies a semantic Destination;
 * this module owns every icon and category color decision.
 */
export const resolveHubItemVisual = (item: HubItem): HubVisual => {
  const group = destinationGroup(item);
  const base = group ? GROUP_VISUALS[group] : FALLBACK_VISUAL;
  return {
    ...base,
    iconName: DESTINATION_ICONS.get(item.key) ?? base.iconName,
  };
};

export const resolveHubGroupVisual = (group: HubModuleGroup['id']): HubVisual =>
  GROUP_VISUALS[group];
