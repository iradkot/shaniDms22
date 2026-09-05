import {useEffect, useRef} from 'react';
import notifee, {AndroidImportance} from '@notifee/react-native';

import {getNotificationRules, markNotificationRuleCalled} from 'app/services/notifications/localNotificationsStore';
import {isRuleSnoozed} from 'app/services/notifications/snoozeStore';
import type {NotificationStoreScope} from 'app/services/notifications/localNotificationsStore';
import {evaluateAlertRule} from 'app/modules/alerts';
import type {AlertRule, AlertRuleTrend} from 'app/modules/alerts';
import {
  decodeLegacyAlertRule,
  type NativeUpdateCenterRepository,
} from 'app/platform/native/alerts/localNotificationRepositories';

const CHANNEL_ID = 'glucose-rule-alerts';
const RULE_COOLDOWN_MS = 20 * 60 * 1000;
const MAX_ALERT_SAMPLE_AGE_MS = 10 * 60 * 1000;
const MAX_ALERT_SAMPLE_FUTURE_SKEW_MS = 2 * 60 * 1000;

type GlucoseNotificationSample = {
  readonly sgv: number;
  readonly date: number;
  readonly direction?: string;
};

const extractNotificationSample = (
  snapshot: unknown,
): GlucoseNotificationSample | undefined => {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return undefined;
  }
  const enrichedBg = (snapshot as Record<string, unknown>).enrichedBg;
  if (typeof enrichedBg !== 'object' || enrichedBg === null) {
    return undefined;
  }
  const candidate = enrichedBg as Record<string, unknown>;
  if (
    typeof candidate.sgv !== 'number' ||
    !Number.isFinite(candidate.sgv) ||
    typeof candidate.date !== 'number' ||
    !Number.isFinite(candidate.date)
  ) {
    return undefined;
  }
  return {
    sgv: candidate.sgv,
    date: candidate.date,
    ...(typeof candidate.direction === 'string'
      ? {direction: candidate.direction}
      : {}),
  };
};

const OBSERVATION_TRENDS: Readonly<Record<string, AlertRuleTrend | undefined>> = {
  DoubleDown: 'double-down',
  SingleDown: 'single-down',
  FortyFiveDown: 'forty-five-down',
  FortyFiveUp: 'forty-five-up',
  SingleUp: 'single-up',
  DoubleUp: 'double-up',
};

const DIRECTION_SYMBOLS: Readonly<Record<string, string>> = {
  DoubleDown: '↓↓',
  SingleDown: '↓',
  FortyFiveDown: '↘',
  Flat: '→',
  FortyFiveUp: '↗',
  SingleUp: '↑',
  DoubleUp: '↑↑',
};

const NOTIFICATION_COPY = {
  en: {
    channel: 'Glucose alerts',
    title: 'Glucose alert',
    snooze: (minutes: number) => `Snooze ${minutes}m`,
  },
  he: {
    channel: 'התראות סוכר',
    title: 'התראת סוכר',
    snooze: (minutes: number) => `נודניק ${minutes} דקות`,
  },
} as const;

async function ensureChannel(locale: 'en' | 'he') {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: NOTIFICATION_COPY[locale].channel,
    importance: AndroidImportance.HIGH,
  });
}

export function useGlucoseRuleNotifications(
  latestSnapshot?: unknown,
  workspaceScopeId?: string,
  updateCenterRepository?: Pick<NativeUpdateCenterRepository, 'append'>,
  locale: 'en' | 'he' = 'en',
) {
  const lastSampleRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const sample = extractNotificationSample(latestSnapshot);
      if (
        !sample ||
        !Number.isSafeInteger(sample.date) ||
        sample.date <= 0 ||
        workspaceScopeId === undefined
      ) {
        return;
      }
      const nowMs = Date.now();
      const sampleAgeMs = nowMs - sample.date;
      if (
        sampleAgeMs > MAX_ALERT_SAMPLE_AGE_MS ||
        sampleAgeMs < -MAX_ALERT_SAMPLE_FUTURE_SKEW_MS
      ) {
        return;
      }
      const sampleIdentity = `${workspaceScopeId}:${sample.date}`;
      if (lastSampleRef.current === sampleIdentity) {
        return;
      }
      lastSampleRef.current = sampleIdentity;

      const scope: NotificationStoreScope = {scopeId: workspaceScopeId};
      const rules = await getNotificationRules(scope);
      if (!active || !rules.length) {
        return;
      }

      await ensureChannel(locale);
      if (!active) {
        return;
      }

      for (const storedRule of rules) {
        if (!active) {
          return;
        }
        let rule: AlertRule;
        try {
          rule = decodeLegacyAlertRule(storedRule);
        } catch {
          continue;
        }
        const ruleId = rule.id;
        if (await isRuleSnoozed(ruleId, nowMs, scope)) {
          continue;
        }
        if (!active) {
          return;
        }
        const observationTrend =
          sample.direction === undefined
            ? undefined
            : OBSERVATION_TRENDS[sample.direction];
        const decision = evaluateAlertRule(
          rule,
          {
            valueMgDl: sample.sgv,
            ...(observationTrend === undefined
              ? {}
              : {trend: observationTrend}),
          },
          nowMs,
          {cooldownMs: RULE_COOLDOWN_MS},
        );
        if (!decision.trigger) {
          continue;
        }
        let occurrenceId = `rule-occurrence:${ruleId}:${nowMs}`;
        if (updateCenterRepository !== undefined) {
          if (!active) {
            return;
          }
          try {
            const occurrence = await updateCenterRepository.append({
              kind: 'alert',
              occurredAtMs: nowMs,
              content: {
                kind: 'alert-rule-occurrence',
                rule: {
                  id: rule.id,
                  name: rule.name,
                  lowerBoundMgDl: rule.lowerBoundMgDl,
                  upperBoundMgDl: rule.upperBoundMgDl,
                  activeFromMinute: rule.activeFromMinute,
                  activeToMinute: rule.activeToMinute,
                  trend: rule.trend,
                },
                observation: {
                  valueMgDl: Math.round(sample.sgv),
                  ...(observationTrend === undefined
                    ? {}
                    : {trend: observationTrend}),
                },
              },
            });
            occurrenceId = occurrence.id;
          } catch (error) {
            // Alert delivery stays available even if local history is full or
            // temporarily unavailable.
            console.warn(
              'useGlucoseRuleNotifications: occurrence was not retained',
              error,
            );
          }
        }
        if (!active) {
          return;
        }

        const copy = NOTIFICATION_COPY[locale];
        const direction =
          sample.direction === undefined
            ? '—'
            : DIRECTION_SYMBOLS[sample.direction] ?? sample.direction;
        const body = `${Math.round(sample.sgv)} mg/dL • ${direction} • ${
          rule.name
        }`;
        await notifee.displayNotification({
          title: copy.title,
          body,
          android: {
            channelId: CHANNEL_ID,
            smallIcon: 'ic_launcher',
            importance: AndroidImportance.HIGH,
            pressAction: {id: 'default'},
            actions: [
              {title: copy.snooze(10), pressAction: {id: 'snooze_10'}},
              {title: copy.snooze(20), pressAction: {id: 'snooze_20'}},
              {title: copy.snooze(30), pressAction: {id: 'snooze_30'}},
            ],
          },
          data: {
            source: 'rule_based',
            ruleId,
            occurrenceId,
            workspaceScopeId,
          },
        });

        if (!active) {
          return;
        }
        await markNotificationRuleCalled(ruleId, nowMs, scope);
      }
    };

    run().catch(err => {
      console.warn('useGlucoseRuleNotifications: evaluation failed', err);
    });
    return () => {
      active = false;
    };
  }, [latestSnapshot, locale, updateCenterRepository, workspaceScopeId]);
}
