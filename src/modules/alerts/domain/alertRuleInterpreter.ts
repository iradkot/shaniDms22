import {
  ALERT_RULE_TRENDS,
  encodeAlertRuleConditionBounds,
  parseClockTime,
  validateAlertRuleInput,
  type AlertRuleCondition,
  type AlertRuleInput,
  type AlertRuleTrend,
} from './alertRules';

export type AlertRuleChat = (prompt: string) => Promise<string>;

export const ALERT_RULE_INTERPRETATION_ERROR_MESSAGE =
  'The AI response could not be converted into an alert rule.';

export class AlertRuleInterpretationError extends Error {
  readonly code = 'invalid-alert-rule-interpretation';

  constructor() {
    super(ALERT_RULE_INTERPRETATION_ERROR_MESSAGE);
    this.name = 'AlertRuleInterpretationError';
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const DRAFT_KEYS = [
  'name',
  'condition',
  'thresholdMgDl',
  'lowerBoundMgDl',
  'upperBoundMgDl',
  'activeFrom',
  'activeTo',
  'timePreset',
  'trend',
] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactDraftKeys = (value: UnknownRecord): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...DRAFT_KEYS].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const isCondition = (value: unknown): value is AlertRuleCondition =>
  value === 'below' || value === 'above' || value === 'outside-range';

const optionalInteger = (value: unknown): number | undefined =>
  Number.isSafeInteger(value) ? (value as number) : undefined;

const optionalClockMinute = (value: unknown): number | undefined =>
  typeof value === 'string' ? parseClockTime(value) : undefined;

const parseTrend = (value: unknown): AlertRuleTrend | undefined => {
  if (value === null || value === undefined) {
    return 'any';
  }
  return typeof value === 'string' &&
    (ALERT_RULE_TRENDS as readonly string[]).includes(value)
    ? (value as AlertRuleTrend)
    : undefined;
};

const parseJsonObject = (response: string): UnknownRecord => {
  if (response.length === 0 || response.length > 20_000) {
    throw new AlertRuleInterpretationError();
  }
  try {
    const parsed: unknown = JSON.parse(response);
    if (!isRecord(parsed) || !hasExactDraftKeys(parsed)) {
      throw new AlertRuleInterpretationError();
    }
    return parsed;
  } catch (error) {
    if (error instanceof AlertRuleInterpretationError) {
      throw error;
    }
    throw new AlertRuleInterpretationError();
  }
};

const clockWindow = (
  value: UnknownRecord,
):
  | {
      readonly activeFromMinute: number;
      readonly activeToMinute: number;
    }
  | undefined => {
  const preset = value.timePreset;
  const from = optionalClockMinute(value.activeFrom);
  const to = optionalClockMinute(value.activeTo);
  const hasNeitherExactTime =
    (value.activeFrom === null || value.activeFrom === undefined) &&
    (value.activeTo === null || value.activeTo === undefined);

  if (preset === 'night' && hasNeitherExactTime) {
    return {activeFromMinute: 22 * 60, activeToMinute: 7 * 60};
  }
  if (preset === 'all-day' && hasNeitherExactTime) {
    return {activeFromMinute: 0, activeToMinute: 1439};
  }
  if (
    (preset === 'night' || preset === 'all-day' || preset === 'custom') &&
    from !== undefined &&
    to !== undefined
  ) {
    return {activeFromMinute: from, activeToMinute: to};
  }
  return undefined;
};

const glucoseBounds = (
  value: UnknownRecord,
  condition: AlertRuleCondition,
):
  | {readonly lowerBoundMgDl: number; readonly upperBoundMgDl: number}
  | undefined => {
  const threshold = optionalInteger(value.thresholdMgDl);
  const lower = optionalInteger(value.lowerBoundMgDl);
  const upper = optionalInteger(value.upperBoundMgDl);

  if (
    condition === 'below' &&
    threshold !== undefined &&
    threshold > 1 &&
    threshold < 1000 &&
    value.lowerBoundMgDl === null &&
    value.upperBoundMgDl === null
  ) {
    return encodeAlertRuleConditionBounds('below', {
      lowerBoundMgDl: threshold,
      upperBoundMgDl: 1000,
    });
  }
  if (
    condition === 'above' &&
    threshold !== undefined &&
    threshold > 1 &&
    threshold < 1000 &&
    value.lowerBoundMgDl === null &&
    value.upperBoundMgDl === null
  ) {
    return encodeAlertRuleConditionBounds('above', {
      lowerBoundMgDl: 1,
      upperBoundMgDl: threshold,
    });
  }
  if (
    condition === 'outside-range' &&
    value.thresholdMgDl === null &&
    lower !== undefined &&
    upper !== undefined
  ) {
    return encodeAlertRuleConditionBounds(condition, {
      lowerBoundMgDl: lower,
      upperBoundMgDl: upper,
    });
  }
  return undefined;
};

const decodeDraft = (response: string): AlertRuleInput => {
  const value = parseJsonObject(response);
  const condition = value.condition;
  const name = value.name;
  const trend = parseTrend(value.trend);
  if (!isCondition(condition) || typeof name !== 'string' || !trend) {
    throw new AlertRuleInterpretationError();
  }
  const bounds = glucoseBounds(value, condition);
  const window = clockWindow(value);
  if (!bounds || !window) {
    throw new AlertRuleInterpretationError();
  }
  const validated = validateAlertRuleInput({
    name,
    enabled: true,
    ...bounds,
    ...window,
    trend,
  });
  if (!validated.ok) {
    throw new AlertRuleInterpretationError();
  }
  return validated.value;
};

const interpreterPrompt = (request: string): string => `You convert a user's
glucose alert request into one strict JSON object. Return JSON only, with no
Markdown or explanation. Use exactly these keys:
{"name":string,"condition":"below"|"above"|"outside-range","thresholdMgDl":number|null,"lowerBoundMgDl":number|null,"upperBoundMgDl":number|null,"activeFrom":"HH:mm"|null,"activeTo":"HH:mm"|null,"timePreset":"night"|"all-day"|"custom","trend":"any"|"double-down"|"single-down"|"forty-five-down"|"forty-five-up"|"single-up"|"double-up"|null}

For below or above, put the one threshold in thresholdMgDl and set both range
bounds to null. For outside-range, set thresholdMgDl to null and provide both
bounds. If the user says night but gives no exact times, use timePreset night
and set both times to null. If no time is requested, use all-day with null
times. Use custom only when both exact times are known. Use trend any when no
trend is requested. Keep name short and in the user's language.

User request: ${JSON.stringify(request)}`;

/**
 * Interprets a draft only. The caller decides whether and where to persist it.
 */
export const interpretAlertRuleDraft = async (
  request: string,
  chat: AlertRuleChat,
): Promise<AlertRuleInput> => {
  const trimmed = request.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) {
    throw new AlertRuleInterpretationError();
  }
  const response = await chat(interpreterPrompt(trimmed));
  if (typeof response !== 'string') {
    throw new AlertRuleInterpretationError();
  }
  return decodeDraft(response);
};
