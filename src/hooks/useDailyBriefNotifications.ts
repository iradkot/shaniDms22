import {useEffect} from 'react';

import {GlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {AiSettings} from 'app/contexts/AiSettingsContext';
import {
  cancelDailyBriefNotifications,
  DailyBriefConfig,
  syncDailyBriefNotifications,
} from 'app/services/proactiveCare/dailyBrief';

export function useDailyBriefNotifications(params: {
  enabled?: boolean;
  scopeId?: string;
  config: DailyBriefConfig;
  glucose: GlucoseSettings;
  ai: AiSettings;
}) {
  const enabled = params.enabled ?? true;
  const {scopeId, config, glucose, ai} = params;

  useEffect(() => {
    if (!enabled || scopeId === undefined) {
      cancelDailyBriefNotifications().catch(() => undefined);
      return;
    }

    syncDailyBriefNotifications({
      scopeId,
      config,
      glucose,
      ai,
    }).catch(err => {
      console.warn('useDailyBriefNotifications: failed to sync daily brief', err);
    });
  }, [ai, config, enabled, glucose, scopeId]);
}
