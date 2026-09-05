import {evaluatePreMealAssistance} from 'app/modules/preMealAssistance';

const HOUR = 60 * 60 * 1000;

describe('evaluatePreMealAssistance', () => {
  it('stays hidden when the capability is disabled', () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();

    expect(
      evaluatePreMealAssistance({
        nowMs,
        period: {dayStartMs: nowMs - 12 * HOUR, dayEndMs: nowMs + 12 * HOUR},
        settings: {enabled: false, notificationsEnabled: true},
        snapshot: {
          relevance: {
            kind: 'active',
            startedAtMs: nowMs - HOUR,
            expiresAtMs: nowMs + HOUR,
          },
          sourceState: {kind: 'live'},
          facts: {observedAtMs: nowMs, glucoseMgDl: 117},
        },
      }),
    ).toEqual({kind: 'hidden', reason: 'disabled'});
  });

  it('stays hidden without a current, explicit pre-meal intent', () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();

    expect(
      evaluatePreMealAssistance({
        nowMs,
        period: {dayStartMs: nowMs - 12 * HOUR, dayEndMs: nowMs + 12 * HOUR},
        settings: {enabled: true, notificationsEnabled: false},
        snapshot: {
          relevance: {kind: 'inactive'},
          sourceState: {kind: 'live'},
        },
      }),
    ).toEqual({kind: 'hidden', reason: 'not-relevant'});
  });

  it('does not appear while the Day Graph shows a historical day', () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();

    expect(
      evaluatePreMealAssistance({
        nowMs,
        period: {
          dayStartMs: nowMs - 36 * HOUR,
          dayEndMs: nowMs - 12 * HOUR,
        },
        settings: {enabled: true, notificationsEnabled: false},
        snapshot: {
          relevance: {
            kind: 'active',
            startedAtMs: nowMs - HOUR,
            expiresAtMs: nowMs + HOUR,
          },
          sourceState: {kind: 'live'},
        },
      }),
    ).toEqual({kind: 'hidden', reason: 'not-current-day'});
  });

  it('hides an expired pre-meal intent', () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();

    expect(
      evaluatePreMealAssistance({
        nowMs,
        period: {dayStartMs: nowMs - 12 * HOUR, dayEndMs: nowMs + 12 * HOUR},
        settings: {enabled: true, notificationsEnabled: false},
        snapshot: {
          relevance: {
            kind: 'active',
            startedAtMs: nowMs - 2 * HOUR,
            expiresAtMs: nowMs,
          },
          sourceState: {kind: 'live'},
        },
      }),
    ).toEqual({kind: 'hidden', reason: 'not-relevant'});
  });

  it('exposes only factual, current context for an active intent', () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();

    expect(
      evaluatePreMealAssistance({
        nowMs,
        period: {dayStartMs: nowMs - 12 * HOUR, dayEndMs: nowMs + 12 * HOUR},
        settings: {enabled: true, notificationsEnabled: false},
        snapshot: {
          relevance: {
            kind: 'active',
            startedAtMs: nowMs - HOUR,
            expiresAtMs: nowMs + HOUR,
          },
          sourceState: {kind: 'live'},
          facts: {
            observedAtMs: nowMs - 4 * 60 * 1000,
            glucoseMgDl: 117,
            trend: 'forty-five-up',
            iobUnits: 1.25,
            cobGrams: 12,
          },
        },
      }),
    ).toEqual({
      kind: 'visible',
      availability: 'current',
      ageMinutes: 4,
      facts: {
        observedAtMs: nowMs - 4 * 60 * 1000,
        glucoseMgDl: 117,
        trend: 'forty-five-up',
        iobUnits: 1.25,
        cobGrams: 12,
      },
    });
  });

  it('marks old cached facts stale and an offline source offline', () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();
    const common = {
      nowMs,
      period: {dayStartMs: nowMs - 12 * HOUR, dayEndMs: nowMs + 12 * HOUR},
      settings: {enabled: true, notificationsEnabled: false},
      snapshot: {
        relevance: {
          kind: 'active' as const,
          startedAtMs: nowMs - HOUR,
          expiresAtMs: nowMs + HOUR,
        },
        sourceState: {kind: 'live' as const},
        facts: {observedAtMs: nowMs - 16 * 60 * 1000, glucoseMgDl: 105},
      },
    };

    expect(evaluatePreMealAssistance(common)).toMatchObject({
      kind: 'visible',
      availability: 'stale',
      ageMinutes: 16,
    });
    expect(
      evaluatePreMealAssistance({
        ...common,
        snapshot: {
          ...common.snapshot,
          sourceState: {kind: 'offline', reason: 'Saved copy'} as const,
          facts: {observedAtMs: nowMs - 2 * 60 * 1000, glucoseMgDl: 105},
        },
      }),
    ).toMatchObject({kind: 'visible', availability: 'offline', ageMinutes: 2});
  });

  it('uses the exact freshness boundary rather than rounded minutes', () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();

    expect(
      evaluatePreMealAssistance({
        nowMs,
        period: {dayStartMs: nowMs - 12 * HOUR, dayEndMs: nowMs + 12 * HOUR},
        settings: {enabled: true, notificationsEnabled: false},
        snapshot: {
          relevance: {
            kind: 'active',
            startedAtMs: nowMs - HOUR,
            expiresAtMs: nowMs + HOUR,
          },
          sourceState: {kind: 'live'},
          facts: {
            observedAtMs: nowMs - (15 * 60 * 1000 + 59_000),
            glucoseMgDl: 105,
          },
        },
      }),
    ).toMatchObject({kind: 'visible', availability: 'stale', ageMinutes: 15});
  });

  it('never exposes malformed source values as medical facts', () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();
    const result = evaluatePreMealAssistance({
      nowMs,
      period: {dayStartMs: nowMs - 12 * HOUR, dayEndMs: nowMs + 12 * HOUR},
      settings: {enabled: true, notificationsEnabled: false},
      snapshot: {
        relevance: {
          kind: 'active',
          startedAtMs: nowMs - HOUR,
          expiresAtMs: nowMs + HOUR,
        },
        sourceState: {kind: 'live'},
        facts: {
          observedAtMs: nowMs,
          glucoseMgDl: Number.NaN,
          trend: 'not-a-real-direction' as never,
          iobUnits: Number.POSITIVE_INFINITY,
          cobGrams: -4,
        },
      },
    });

    expect(result).toEqual({
      kind: 'visible',
      availability: 'current',
      ageMinutes: 0,
      facts: {observedAtMs: nowMs},
    });
  });
});
