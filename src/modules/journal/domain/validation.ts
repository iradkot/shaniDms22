export type ValidationPathSegment = string | number;

export const VALIDATION_ISSUE_CODES = {
  REQUIRED: 'validation.required',
  INVALID_TYPE: 'validation.invalid_type',
  INVALID_FORMAT: 'validation.invalid_format',
  OUT_OF_RANGE: 'validation.out_of_range',
  INVALID_VALUE: 'validation.invalid_value',
  DUPLICATE: 'validation.duplicate',
  INVARIANT: 'validation.invariant',
} as const;

export type ValidationIssueCode =
  (typeof VALIDATION_ISSUE_CODES)[keyof typeof VALIDATION_ISSUE_CODES];

export interface ValidationIssue {
  readonly code: ValidationIssueCode;
  readonly path: readonly ValidationPathSegment[];
  readonly message: string;
}

export type ParseResult<T> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly issues: readonly ValidationIssue[]};

export function valid<T>(value: T): ParseResult<T> {
  return {ok: true, value};
}

export function invalid<T>(issues: readonly ValidationIssue[]): ParseResult<T> {
  return {ok: false, issues};
}

export function issue(
  code: ValidationIssueCode,
  path: readonly ValidationPathSegment[],
  message: string,
): ValidationIssue {
  return {code, path, message};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseObject(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<Record<string, unknown>> {
  return isRecord(value)
    ? valid(value)
    : invalid([
        issue(VALIDATION_ISSUE_CODES.INVALID_TYPE, path, 'Expected an object.'),
      ]);
}

export function parseRequiredString(
  value: unknown,
  path: readonly ValidationPathSegment[],
): ParseResult<string> {
  if (typeof value !== 'string') {
    return invalid([
      issue(
        value === undefined
          ? VALIDATION_ISSUE_CODES.REQUIRED
          : VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        value === undefined ? 'A value is required.' : 'Expected a string.',
      ),
    ]);
  }

  if (value.trim().length === 0) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_FORMAT,
        path,
        'Expected a non-empty string.',
      ),
    ]);
  }

  return valid(value);
}

export function parseOptionalString(
  value: unknown,
  path: readonly ValidationPathSegment[],
  options: {readonly allowEmpty?: boolean} = {},
): ParseResult<string | undefined> {
  if (value === undefined || value === null) {
    return valid(undefined);
  }

  if (typeof value !== 'string') {
    return invalid([
      issue(VALIDATION_ISSUE_CODES.INVALID_TYPE, path, 'Expected a string.'),
    ]);
  }

  if (!options.allowEmpty && value.trim().length === 0) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_FORMAT,
        path,
        'Expected a non-empty string.',
      ),
    ]);
  }

  return valid(value);
}

export function parseFiniteNumber(
  value: unknown,
  path: readonly ValidationPathSegment[],
): ParseResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected a finite number.',
      ),
    ]);
  }

  return valid(value);
}

export function parsePositiveNumber(
  value: unknown,
  path: readonly ValidationPathSegment[],
): ParseResult<number> {
  const parsed = parseFiniteNumber(value, path);
  if (!parsed.ok) {
    return parsed;
  }

  return parsed.value > 0
    ? parsed
    : invalid([
        issue(
          VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
          path,
          'Expected a number greater than zero.',
        ),
      ]);
}

export function parseNonNegativeInteger(
  value: unknown,
  path: readonly ValidationPathSegment[],
): ParseResult<number> {
  const parsed = parseFiniteNumber(value, path);
  if (!parsed.ok) {
    return parsed;
  }

  return Number.isSafeInteger(parsed.value) && parsed.value >= 0
    ? parsed
    : invalid([
        issue(
          VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
          path,
          'Expected a non-negative safe integer.',
        ),
      ]);
}

export function parseTimestampMs(
  value: unknown,
  path: readonly ValidationPathSegment[],
): ParseResult<number> {
  const parsed = parseFiniteNumber(value, path);
  if (!parsed.ok) {
    return parsed;
  }

  return Number.isSafeInteger(parsed.value) && parsed.value > 0
    ? parsed
    : invalid([
        issue(
          VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
          path,
          'Expected a positive Unix timestamp in milliseconds.',
        ),
      ]);
}

// Mirrors the rule-side safety bound for an atomic Journal write.
export const JOURNAL_MAX_TAGS = 8;

export function parseStringArray(
  value: unknown,
  path: readonly ValidationPathSegment[],
): ParseResult<readonly string[]> {
  if (value === undefined || value === null) {
    return valid([]);
  }

  if (!Array.isArray(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected an array of strings.',
      ),
    ]);
  }

  if (value.length > JOURNAL_MAX_TAGS) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
        path,
        `At most ${JOURNAL_MAX_TAGS} tags are allowed.`,
      ),
    ]);
  }

  const output: string[] = [];
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  value.forEach((item, index) => {
    const itemPath = [...path, index];
    const parsed = parseRequiredString(item, itemPath);
    if (!parsed.ok) {
      issues.push(...parsed.issues);
      return;
    }
    if (parsed.value.length > 80) {
      issues.push(
        issue(
          VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
          itemPath,
          'A tag may contain at most 80 characters.',
        ),
      );
      return;
    }

    const canonical = parsed.value.trim().toLocaleLowerCase();
    if (seen.has(canonical)) {
      issues.push(
        issue(
          VALIDATION_ISSUE_CODES.DUPLICATE,
          itemPath,
          'Duplicate values are not allowed.',
        ),
      );
      return;
    }

    seen.add(canonical);
    output.push(parsed.value);
  });

  return issues.length > 0 ? invalid(issues) : valid(output);
}

export function collectIssues(
  ...results: readonly ParseResult<unknown>[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  results.forEach(result => {
    if (!result.ok) {
      issues.push(...result.issues);
    }
  });
  return issues;
}
