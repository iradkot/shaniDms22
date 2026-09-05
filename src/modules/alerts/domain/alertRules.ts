export const ALERT_RULE_TRENDS = [
  'any',
  'double-down',
  'single-down',
  'forty-five-down',
  'forty-five-up',
  'single-up',
  'double-up',
] as const;

export type AlertRuleTrend = (typeof ALERT_RULE_TRENDS)[number];

export interface AlertRuleInput {
  readonly name: string;
  readonly enabled: boolean;
  readonly lowerBoundMgDl: number;
  readonly upperBoundMgDl: number;
  /** Local wall-clock minute, inclusive, from 0 through 1439. */
  readonly activeFromMinute: number;
  /** Local wall-clock minute, inclusive, from 0 through 1439. */
  readonly activeToMinute: number;
  readonly trend: AlertRuleTrend;
}

export interface AlertRule extends AlertRuleInput {
  readonly id: string;
  /** Factual trigger timestamps retained by the source, newest last. */
  readonly triggeredAtMs: readonly number[];
}

export interface AlertRuleObservation {
  readonly valueMgDl: number;
  readonly trend?: AlertRuleTrend;
}

export type AlertRuleEvaluation =
  | {readonly trigger: true; readonly reason: 'outside-range'}
  | {
      readonly trigger: false;
      readonly reason:
        | 'disabled'
        | 'invalid-observation'
        | 'inactive-window'
        | 'inside-range'
        | 'trend-mismatch'
        | 'cooldown';
    };

const localMinuteOfDay = (timestampMs: number): number => {
  const date = new Date(timestampMs);
  return date.getHours() * 60 + date.getMinutes();
};

const isMinuteInWindow = (
  minute: number,
  from: number,
  to: number,
): boolean =>
  from <= to ? minute >= from && minute <= to : minute >= from || minute <= to;

/**
 * Pure, deterministic alert decision. Glucose limits are strict: a value
 * exactly on either configured boundary remains inside the range.
 */
export const evaluateAlertRule = (
  rule: AlertRule,
  observation: AlertRuleObservation,
  evaluatedAtMs: number,
  options: {readonly cooldownMs?: number} = {},
): AlertRuleEvaluation => {
  if (!rule.enabled) {
    return {trigger: false, reason: 'disabled'};
  }
  if (
    !Number.isFinite(observation.valueMgDl) ||
    !Number.isSafeInteger(evaluatedAtMs) ||
    evaluatedAtMs <= 0
  ) {
    return {trigger: false, reason: 'invalid-observation'};
  }
  if (
    !isMinuteInWindow(
      localMinuteOfDay(evaluatedAtMs),
      rule.activeFromMinute,
      rule.activeToMinute,
    )
  ) {
    return {trigger: false, reason: 'inactive-window'};
  }
  if (
    observation.valueMgDl >= rule.lowerBoundMgDl &&
    observation.valueMgDl <= rule.upperBoundMgDl
  ) {
    return {trigger: false, reason: 'inside-range'};
  }
  if (rule.trend !== 'any' && observation.trend !== rule.trend) {
    return {trigger: false, reason: 'trend-mismatch'};
  }
  const cooldownMs = options.cooldownMs ?? 0;
  const lastTriggeredAtMs = rule.triggeredAtMs[rule.triggeredAtMs.length - 1];
  if (
    cooldownMs > 0 &&
    lastTriggeredAtMs !== undefined &&
    Number.isFinite(lastTriggeredAtMs) &&
    evaluatedAtMs - lastTriggeredAtMs < cooldownMs
  ) {
    return {trigger: false, reason: 'cooldown'};
  }
  return {trigger: true, reason: 'outside-range'};
};

export type AlertRuleValidationCode =
  | 'name-required'
  | 'name-too-long'
  | 'glucose-not-integer'
  | 'glucose-out-of-bounds'
  | 'glucose-range-order'
  | 'time-not-integer'
  | 'time-out-of-bounds'
  | 'time-window-empty';

export interface AlertRuleValidationIssue {
  readonly code: AlertRuleValidationCode;
  readonly field:
    | 'name'
    | 'lowerBoundMgDl'
    | 'upperBoundMgDl'
    | 'activeFromMinute'
    | 'activeToMinute';
}

export type AlertRuleValidationResult =
  | {readonly ok: true; readonly value: AlertRuleInput}
  | {
      readonly ok: false;
      readonly issues: readonly AlertRuleValidationIssue[];
    };

const isIntegerInRange = (value: number, minimum: number, maximum: number) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;

/**
 * Validates the complete persisted rule before it reaches a repository.
 * A start later than the end is intentionally valid and means overnight.
 */
export const validateAlertRuleInput = (
  input: AlertRuleInput,
): AlertRuleValidationResult => {
  const issues: AlertRuleValidationIssue[] = [];
  const name = input.name.trim();

  if (name.length === 0) {
    issues.push({code: 'name-required', field: 'name'});
  } else if (name.length > 80) {
    issues.push({code: 'name-too-long', field: 'name'});
  }

  for (const [field, value] of [
    ['lowerBoundMgDl', input.lowerBoundMgDl],
    ['upperBoundMgDl', input.upperBoundMgDl],
  ] as const) {
    if (!Number.isSafeInteger(value)) {
      issues.push({code: 'glucose-not-integer', field});
    } else if (!isIntegerInRange(value, 1, 1000)) {
      issues.push({code: 'glucose-out-of-bounds', field});
    }
  }

  if (
    isIntegerInRange(input.lowerBoundMgDl, 1, 1000) &&
    isIntegerInRange(input.upperBoundMgDl, 1, 1000) &&
    input.lowerBoundMgDl >= input.upperBoundMgDl
  ) {
    issues.push({code: 'glucose-range-order', field: 'upperBoundMgDl'});
  }

  for (const [field, value] of [
    ['activeFromMinute', input.activeFromMinute],
    ['activeToMinute', input.activeToMinute],
  ] as const) {
    if (!Number.isSafeInteger(value)) {
      issues.push({code: 'time-not-integer', field});
    } else if (!isIntegerInRange(value, 0, 1439)) {
      issues.push({code: 'time-out-of-bounds', field});
    }
  }

  if (
    isIntegerInRange(input.activeFromMinute, 0, 1439) &&
    input.activeFromMinute === input.activeToMinute
  ) {
    issues.push({code: 'time-window-empty', field: 'activeToMinute'});
  }

  if (issues.length > 0) {
    return {ok: false, issues};
  }

  return {
    ok: true,
    value: {
      ...input,
      name,
    },
  };
};

/** Strict `HH:mm` parser for local wall-clock form input. */
export const parseClockTime = (value: string): number | undefined => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return isIntegerInRange(hour, 0, 23) && isIntegerInRange(minute, 0, 59)
    ? hour * 60 + minute
    : undefined;
};

export const formatClockTime = (minuteOfDay: number): string => {
  if (!isIntegerInRange(minuteOfDay, 0, 1439)) {
    throw new Error('Clock minute must be an integer from 0 through 1439.');
  }
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(
    minuteOfDay % 60,
  ).padStart(2, '0')}`;
};
