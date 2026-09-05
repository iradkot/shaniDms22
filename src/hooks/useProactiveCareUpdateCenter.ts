import {useEffect} from 'react';
import type {AppOwnedUpdateCenterRepository} from '../modules/alerts';
import type {NativePreMealIntent} from '../platform/native/product/nativePreMealAssistance';
import {
  getLatestDailyBrief,
  subscribeToDailyBriefs,
  type StoredBrief,
} from '../services/proactiveCare/dailyBrief';

const validTimestamp = (value: string): number | undefined => {
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const localDayStart = (timestampMs: number): number => {
  const day = new Date(timestampMs);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};

const appendBrief = async (
  repository: AppOwnedUpdateCenterRepository,
  brief: StoredBrief,
): Promise<void> => {
  const occurredAtMs = validTimestamp(brief.createdAt);
  if (occurredAtMs === undefined) {
    return;
  }
  await repository.append({
    idempotencyKey: `daily-brief:${occurredAtMs}`,
    kind: 'generated-update',
    occurredAtMs,
    content: {
      kind: 'message',
      title: brief.title.slice(0, 160),
      body: brief.body.slice(0, 2_000),
    },
  });
};

/** Projects approved proactive-care products into the offline-first feed. */
export const useProactiveCareUpdateCenter = (input: {
  readonly scopeId: string | undefined;
  readonly locale: 'en' | 'he';
  readonly repository: AppOwnedUpdateCenterRepository | undefined;
  readonly preMealNotificationsEnabled: boolean;
  readonly preMealIntent?: NativePreMealIntent;
}): void => {
  const {
    locale,
    preMealIntent,
    preMealNotificationsEnabled,
    repository,
    scopeId,
  } = input;
  useEffect(() => {
    if (scopeId === undefined || repository === undefined) {
      return undefined;
    }
    let active = true;
    const ingestLatest = async (): Promise<void> => {
      const brief = await getLatestDailyBrief(scopeId);
      if (active && brief !== null) {
        await appendBrief(repository, brief);
      }
    };
    ingestLatest().catch(() => undefined);
    const unsubscribe = subscribeToDailyBriefs((briefScope, brief) => {
      if (active && briefScope === scopeId) {
        appendBrief(repository, brief).catch(() => undefined);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, scopeId]);

  useEffect(() => {
    if (
      scopeId === undefined ||
      repository === undefined ||
      !preMealNotificationsEnabled ||
      preMealIntent === undefined
    ) {
      return;
    }
    const occurredAtMs = Math.min(
      preMealIntent.startedAtMs + 10 * 60_000,
      preMealIntent.expiresAtMs - 60_000,
    );
    if (occurredAtMs <= 0) {
      return;
    }
    repository
      .append({
        idempotencyKey: `pre-meal:${preMealIntent.startedAtMs}`,
        kind: 'reminder',
        occurredAtMs,
        content: {
          kind: 'message',
          title:
            locale === 'he'
              ? 'תזכורת לפני ארוחה'
              : 'Pre-meal reminder',
          body:
            locale === 'he'
              ? 'אפשר לפתוח את גרף היום ולתעד את הארוחה.'
              : 'Open the Day Graph and record the meal when ready.',
        },
        deepLink: {
          kind: 'day',
          dayStartMs: localDayStart(preMealIntent.startedAtMs),
        },
      })
      .catch(() => undefined);
  }, [
    locale,
    preMealIntent,
    preMealNotificationsEnabled,
    repository,
    scopeId,
  ]);
};
