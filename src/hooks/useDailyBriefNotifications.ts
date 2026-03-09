import {useEffect} from 'react';

import {GlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {AiSettings} from 'app/contexts/AiSettingsContext';
import {DailyBriefConfig, syncDailyBriefNotifications} from 'app/services/proactiveCare/dailyBrief';

export function useDailyBriefNotifications(params: {
  enabled?: boolean;
  config: DailyBriefConfig;
  glucose: GlucoseSettings;
  ai: AiSettings;
}) {
  const enabled = params.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    syncDailyBriefNotifications({
      config: params.config,
      glucose: params.glucose,
      ai: params.ai,
    }).catch(err => {
      console.warn('useDailyBriefNotifications: failed to sync daily brief', err);
    });
  }, [
    enabled,
    params.config.enabled,
    params.config.hour,
    params.config.minute,
    params.glucose,
    params.ai.enabled,
    params.ai.apiKey,
    params.ai.openAiModel,
  ]);
}
