import type {AiSpecialistId} from '../../modules/ai';
import {
  CORE_IMPLEMENTATION_KEYS,
  type CoreImplementationKey,
} from '../destinations';

/** One local mapping is the only switch needed to wire every curated AI child. */
export const aiSpecialistForImplementationKey = (
  implementationKey: CoreImplementationKey,
): AiSpecialistId | undefined => {
  switch (implementationKey) {
    case CORE_IMPLEMENTATION_KEYS.aiGeneralChat:
      return 'general-chat';
    case CORE_IMPLEMENTATION_KEYS.aiHypoSpecialist:
      return 'hypo-investigation';
    case CORE_IMPLEMENTATION_KEYS.aiBehaviorSpecialist:
      return 'behavior-analysis';
    case CORE_IMPLEMENTATION_KEYS.aiMealSpecialist:
      return 'meal-analysis';
    case CORE_IMPLEMENTATION_KEYS.aiLoopSpecialist:
      return 'loop-advice';
    case CORE_IMPLEMENTATION_KEYS.aiAnalyst:
    case CORE_IMPLEMENTATION_KEYS.dayGraph:
    case CORE_IMPLEMENTATION_KEYS.dailyOverview:
    case CORE_IMPLEMENTATION_KEYS.previousDaySummary:
    case CORE_IMPLEMENTATION_KEYS.trends:
    case CORE_IMPLEMENTATION_KEYS.trendsOverview:
    case CORE_IMPLEMENTATION_KEYS.trendsAgpDailyPatterns:
    case CORE_IMPLEMENTATION_KEYS.trendsComparePeriods:
    case CORE_IMPLEMENTATION_KEYS.trendsTherapyContext:
    case CORE_IMPLEMENTATION_KEYS.hypoInvestigation:
    case CORE_IMPLEMENTATION_KEYS.similarEvents:
    case CORE_IMPLEMENTATION_KEYS.loopChangesImpact:
    case CORE_IMPLEMENTATION_KEYS.meals:
    case CORE_IMPLEMENTATION_KEYS.activity:
    case CORE_IMPLEMENTATION_KEYS.updateCenter:
    case CORE_IMPLEMENTATION_KEYS.alertRules:
    case CORE_IMPLEMENTATION_KEYS.settings:
      return undefined;
  }
};
