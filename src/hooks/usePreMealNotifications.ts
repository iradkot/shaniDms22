import {useEffect} from 'react';
import type {NativePreMealIntent} from '../platform/native/product/nativePreMealAssistance';
import {
  cancelPreMealNotification,
  syncPreMealNotification,
} from '../services/proactiveCare/preMealNotifications';

export const usePreMealNotifications = (input: {
  readonly scopeId: string | undefined;
  readonly locale: 'en' | 'he';
  readonly enabled: boolean;
  readonly intent?: NativePreMealIntent;
}): void => {
  useEffect(() => {
    const scopeId = input.scopeId;
    if (scopeId === undefined) {
      return undefined;
    }
    syncPreMealNotification({
      scopeId,
      locale: input.locale,
      enabled: input.enabled,
      ...(input.intent === undefined ? {} : {intent: input.intent}),
    }).catch(() => undefined);
    return () => {
      cancelPreMealNotification(scopeId).catch(() => undefined);
    };
  }, [input.enabled, input.intent, input.locale, input.scopeId]);
};
