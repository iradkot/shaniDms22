import type {AiConversationSummary, AiRecommendationRequest} from '../ai';

/** Replaced by the build tooling. Never populated from downloaded runtime config. */
declare global {
  var __SHANI_RELEASE_CHANNEL__: unknown;
}

export interface ReleaseSafetyPolicy {
  readonly channel: 'development' | 'pilot' | 'production';
  readonly currentRecommendations: boolean;
  readonly experimentalGlucoseForecasts: boolean;
}

/** An absent or unknown build declaration always has the pilot restrictions. */
export const getReleaseSafetyPolicy = (): ReleaseSafetyPolicy => {
  const declared = typeof __SHANI_RELEASE_CHANNEL__ === 'undefined'
    ? undefined : __SHANI_RELEASE_CHANNEL__;
  const channel = declared === 'development' || declared === 'production'
    ? declared : 'pilot';
  return {
    channel,
    currentRecommendations: channel === 'development',
    experimentalGlucoseForecasts: channel === 'development',
  };
};

export const isRecommendationAllowed = (
  request: AiRecommendationRequest | undefined,
): boolean => {
  if (!request) {return false;}
  switch (request.kind) {
    case 'weekly':
    case 'monthly':
    case 'guided':
      return true;
    case 'now':
    case 'meal':
      return getReleaseSafetyPolicy().currentRecommendations;
    default:
      return false;
  }
};

/** Saved transcripts without an explicit safe request are hidden in pilot releases. */
export const isAiConversationAllowed = (conversation: AiConversationSummary): boolean =>
  getReleaseSafetyPolicy().currentRecommendations ||
  isRecommendationAllowed(conversation.recommendation);

export const pilotAiNotice = (locale: 'en' | 'he'): string => locale === 'he'
  ? 'בפיילוט זמינים סיכומים וניתוח של נתוני העבר בלבד. ניתוח AI לא עבר תיקוף קליני. אין להשתמש בו לקבלת החלטות טיפול או מינון.'
  : 'The pilot offers summaries and analysis of past data only. AI analysis has not been clinically validated. Do not use it for treatment or dosing decisions.';

export const assertRecommendationAllowed = (request: AiRecommendationRequest): void => {
  if (!isRecommendationAllowed(request)) {
    const error = new Error('Current and pre-meal AI recommendations are unavailable in this release.');
    error.name = 'ReleaseSafetyError';
    throw error;
  }
};

export const assertGlucoseForecastAllowed = (): void => {
  if (!getReleaseSafetyPolicy().experimentalGlucoseForecasts) {
    const error = new Error('Experimental glucose forecasts are unavailable in this release.');
    error.name = 'ReleaseSafetyError';
    throw error;
  }
};
