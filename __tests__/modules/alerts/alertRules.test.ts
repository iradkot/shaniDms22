import {
  evaluateAlertRule,
  parseClockTime,
  validateAlertRuleInput,
} from 'app/modules/alerts/domain/alertRules';

describe('alert-rule validation', () => {
  const validRule = {
    name: 'Outside target',
    enabled: true,
    lowerBoundMgDl: 70,
    upperBoundMgDl: 180,
    activeFromMinute: 22 * 60,
    activeToMinute: 6 * 60,
    trend: 'any' as const,
  };

  it('accepts a valid overnight window without changing its facts', () => {
    expect(validateAlertRuleInput(validRule)).toEqual({
      ok: true,
      value: validRule,
    });
  });

  it.each([
    [
      {...validRule, name: ' '},
      'name-required',
    ],
    [
      {...validRule, lowerBoundMgDl: 180},
      'glucose-range-order',
    ],
    [
      {...validRule, lowerBoundMgDl: 0},
      'glucose-out-of-bounds',
    ],
    [
      {...validRule, activeToMinute: 22 * 60},
      'time-window-empty',
    ],
    [
      {...validRule, activeFromMinute: 1440},
      'time-out-of-bounds',
    ],
  ] as const)('rejects invalid input with a stable issue code', (input, code) => {
    const result = validateAlertRuleInput(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map(issue => issue.code)).toContain(code);
    }
  });

  it('parses exact 24-hour clock input and rejects ambiguous values', () => {
    expect(parseClockTime('06:05')).toBe(365);
    expect(parseClockTime('23:59')).toBe(1439);
    expect(parseClockTime('24:00')).toBeUndefined();
    expect(parseClockTime('6:5')).toBeUndefined();
    expect(parseClockTime('06:05 extra')).toBeUndefined();
  });

  it('evaluates strict glucose boundaries and canonical trend matching', () => {
    const rule = {...validRule, id: 'rule-1', triggeredAtMs: []};
    const evaluatedAtMs = new Date(2026, 0, 1, 23, 0).getTime();

    expect(
      evaluateAlertRule(
        rule,
        {valueMgDl: 70, trend: 'single-down'},
        evaluatedAtMs,
      ),
    ).toEqual({trigger: false, reason: 'inside-range'});
    expect(
      evaluateAlertRule(
        {...rule, trend: 'single-down'},
        {valueMgDl: 69, trend: 'single-up'},
        evaluatedAtMs,
      ),
    ).toEqual({trigger: false, reason: 'trend-mismatch'});
    expect(
      evaluateAlertRule(
        {...rule, trend: 'single-down'},
        {valueMgDl: 69, trend: 'single-down'},
        evaluatedAtMs,
      ),
    ).toEqual({trigger: true, reason: 'outside-range'});
  });

  it('handles overnight windows and cooldown at their exact boundaries', () => {
    const atNight = new Date(2026, 0, 1, 23, 0).getTime();
    const cooldownMs = 20 * 60 * 1000;
    const rule = {
      ...validRule,
      id: 'rule-1',
      triggeredAtMs: [atNight - cooldownMs],
    };

    expect(
      evaluateAlertRule(rule, {valueMgDl: 60, trend: 'single-down'}, atNight, {
        cooldownMs,
      }),
    ).toEqual({trigger: true, reason: 'outside-range'});
    expect(
      evaluateAlertRule(
        {...rule, triggeredAtMs: [atNight - cooldownMs + 1]},
        {valueMgDl: 60, trend: 'single-down'},
        atNight,
        {cooldownMs},
      ),
    ).toEqual({trigger: false, reason: 'cooldown'});

    const atNoon = new Date(2026, 0, 1, 12, 0).getTime();
    expect(
      evaluateAlertRule(rule, {valueMgDl: 60, trend: 'single-down'}, atNoon, {
        cooldownMs,
      }),
    ).toEqual({trigger: false, reason: 'inactive-window'});
  });
});
