import {
  CORE_DESTINATION_IDS,
  type DestinationRuntimeContext,
} from '../../../product/destinations';

const NIGHTSCOUT_DESTINATIONS = [
  CORE_DESTINATION_IDS.dayGraph,
  CORE_DESTINATION_IDS.dailyOverview,
  CORE_DESTINATION_IDS.previousDaySummary,
  CORE_DESTINATION_IDS.trends,
  CORE_DESTINATION_IDS.trendsOverview,
  CORE_DESTINATION_IDS.trendsAgpDailyPatterns,
  CORE_DESTINATION_IDS.trendsComparePeriods,
  CORE_DESTINATION_IDS.hypoInvestigation,
  CORE_DESTINATION_IDS.similarEvents,
  CORE_DESTINATION_IDS.loopChangesImpact,
] as const;

const AUTHENTICATED_AI_DESTINATIONS = [
  CORE_DESTINATION_IDS.aiAnalyst,
  CORE_DESTINATION_IDS.aiGeneralChat,
  CORE_DESTINATION_IDS.aiHypoSpecialist,
  CORE_DESTINATION_IDS.aiBehaviorSpecialist,
  CORE_DESTINATION_IDS.aiLoopSpecialist,
  CORE_DESTINATION_IDS.aiMealSpecialist,
] as const;

/**
 * Capabilities are opt-in. Unsupported Product destinations keep their
 * registry-provided `unsupported-platform` reason instead of appearing to work.
 */
export interface WebDestinationRuntimeOptions {
  readonly authenticated?: boolean;
  readonly journalRemote?: boolean;
  readonly nightscout?: boolean;
  readonly ai?: boolean;
  readonly alerts?: boolean;
  readonly locale?: 'en' | 'he';
}

export const createWebDestinationRuntime = (
  options: WebDestinationRuntimeOptions = {},
): DestinationRuntimeContext => {
  const capabilities = new Set<string>(['journal.local', 'settings.web']);
  if (options.authenticated) {
    capabilities.add('account.firebase');
  }
  if (options.journalRemote) {
    capabilities.add('journal.firebase');
  }
  if (options.nightscout) {
    capabilities.add('nightscout.read');
  }
  if (options.ai) {
    capabilities.add('ai.proxy');
  }
  if (options.alerts) {
    capabilities.add('alerts.local');
  }
  const disabledDestinations = new Map<string, string>();
  if (!options.nightscout) {
    const reason =
      options.locale === 'he'
        ? 'נדרש חיבור ל־Nightscout.'
        : 'Connect Nightscout to open this module.';
    NIGHTSCOUT_DESTINATIONS.forEach(id => disabledDestinations.set(id, reason));
  }
  if (!options.ai) {
    const reason =
      options.locale === 'he'
        ? 'יש להתחבר לחשבון כדי להשתמש ב־AI.'
        : 'Sign in to use AI.';
    AUTHENTICATED_AI_DESTINATIONS.forEach(id =>
      disabledDestinations.set(id, reason),
    );
  }
  return {platform: 'web', capabilities, disabledDestinations};
};
