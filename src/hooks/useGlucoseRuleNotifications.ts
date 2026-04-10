import {useEffect, useRef} from 'react';
import notifee, {AndroidImportance} from '@notifee/react-native';

import {BgSample} from 'app/types/day_bgs.types';
import {getNotificationRules, markNotificationRuleCalled} from 'app/services/notifications/localNotificationsStore';

const CHANNEL_ID = 'glucose-rule-alerts';
const RULE_COOLDOWN_MS = 20 * 60 * 1000;

function getMinutesOfDay(dateMs: number): number {
  const d = new Date(dateMs);
  return d.getHours() * 60 + d.getMinutes();
}

function isInWindow(minute: number, from: number, to: number): boolean {
  if (from <= to) return minute >= from && minute <= to;
  return minute >= from || minute <= to;
}

function trendMatches(ruleTrend: string, bgTrend?: string): boolean {
  if (!ruleTrend || ruleTrend === 'NOT COMPUTABLE' || ruleTrend === 'RATE OUT OF RANGE') {
    return true;
  }
  if (!bgTrend) return false;
  return ruleTrend === bgTrend;
}

function shouldTriggerForRule(rule: any, sample: BgSample, nowMs: number): boolean {
  if (!rule?.enabled) return false;
  const sgv = typeof sample.sgv === 'number' ? sample.sgv : null;
  if (sgv == null) return false;

  const minute = getMinutesOfDay(nowMs);
  if (!isInWindow(minute, Number(rule.hour_from_in_minutes), Number(rule.hour_to_in_minutes))) {
    return false;
  }

  const outOfRange = sgv < Number(rule.range_start) || sgv > Number(rule.range_end);
  if (!outOfRange) return false;

  if (!trendMatches(rule.trend, sample.direction)) return false;

  const lastCalled = Array.isArray(rule.times_called) && rule.times_called.length
    ? Number(rule.times_called[rule.times_called.length - 1])
    : 0;

  if (lastCalled > 0 && nowMs - lastCalled < RULE_COOLDOWN_MS) return false;

  return true;
}

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Glucose alerts',
    importance: AndroidImportance.HIGH,
  });
}

export function useGlucoseRuleNotifications(sample?: BgSample | null) {
  const lastSampleTsRef = useRef<number | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!sample || typeof sample.date !== 'number') return;
      if (lastSampleTsRef.current === sample.date) return;
      lastSampleTsRef.current = sample.date;

      const nowMs = Date.now();
      const rules = await getNotificationRules();
      if (!rules.length) return;

      await ensureChannel();

      for (const rule of rules) {
        if (!shouldTriggerForRule(rule, sample, nowMs)) continue;

        const body = `${Math.round(sample.sgv)} mg/dL • ${sample.direction ?? '—'} • ${rule.name}`;
        await notifee.displayNotification({
          title: 'Glucose alert',
          body,
          android: {
            channelId: CHANNEL_ID,
            smallIcon: 'ic_launcher',
            importance: AndroidImportance.HIGH,
            pressAction: {id: 'default'},
          },
          data: {
            source: 'rule_based',
            ruleId: String(rule.id),
          },
        });

        await markNotificationRuleCalled(String(rule.id), nowMs);
      }
    };

    run().catch(err => {
      console.warn('useGlucoseRuleNotifications: evaluation failed', err);
    });
  }, [sample]);
}
