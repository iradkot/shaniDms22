import {
  safeParseStoredDestinationTarget,
  type StoredDestinationTarget,
  type ValidationIssue,
} from '../destinations';
import type {StoredProductShellPreferences} from './types';

type PlainObject = Record<string, unknown>;

export type ShellSafeParseResult<T> =
  | {readonly success: true; readonly value: T}
  | {readonly success: false; readonly issues: readonly ValidationIssue[]};

export class ProductShellValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super('Product Shell preferences are invalid');
    this.name = 'ProductShellValidationError';
    this.issues = issues;
  }
}

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const prefixTargetIssue = (
  issue: ValidationIssue,
  targetPath: string,
): ValidationIssue => ({
  path:
    issue.path === 'target'
      ? targetPath
      : issue.path.replace('target', targetPath),
  message: issue.message,
});

const parseTargetAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredDestinationTarget | undefined => {
  const parsed = safeParseStoredDestinationTarget(value);
  if (!parsed.success) {
    issues.push(...parsed.issues.map(issue => prefixTargetIssue(issue, path)));
    return undefined;
  }
  return parsed.value;
};

/**
 * Strictly validates the persistence boundary and rejects all unknown fields.
 * This prevents a future caller from silently persisting navigation context.
 */
export const safeParseProductShellPreferences = (
  value: unknown,
): ShellSafeParseResult<StoredProductShellPreferences> => {
  if (!isPlainObject(value)) {
    return {
      success: false,
      issues: [{path: 'shell', message: 'Expected a Shell preference object'}],
    };
  }

  const issues: ValidationIssue[] = [];
  const allowedKeys = ['schemaVersion', 'startDestination', 'shortcuts'];
  Object.keys(value).forEach(key => {
    if (!allowedKeys.includes(key)) {
      issues.push({path: `shell.${key}`, message: 'Unknown field'});
    }
  });

  if (value.schemaVersion !== 1) {
    issues.push({
      path: 'shell.schemaVersion',
      message: 'Unsupported schema version',
    });
  }

  const startDestination =
    value.startDestination === undefined
      ? undefined
      : parseTargetAt(value.startDestination, 'shell.startDestination', issues);

  const shortcuts: StoredDestinationTarget[] = [];
  if (!Array.isArray(value.shortcuts)) {
    issues.push({path: 'shell.shortcuts', message: 'Expected an array'});
  } else {
    if (value.shortcuts.length > 2) {
      issues.push({
        path: 'shell.shortcuts',
        message: 'Phone navigation supports at most two shortcuts',
      });
    }
    value.shortcuts.forEach((shortcut, index) => {
      const parsed = parseTargetAt(
        shortcut,
        `shell.shortcuts[${index}]`,
        issues,
      );
      if (parsed) {
        shortcuts.push(parsed);
      }
    });
  }

  const duplicateIds = new Set<string>();
  const seenIds = new Set<string>();
  shortcuts.forEach(shortcut => {
    if (seenIds.has(shortcut.destinationId)) {
      duplicateIds.add(shortcut.destinationId);
    }
    seenIds.add(shortcut.destinationId);
  });
  if (duplicateIds.size > 0) {
    issues.push({
      path: 'shell.shortcuts',
      message: 'A shortcut destination can appear only once',
    });
  }

  if (issues.length > 0) {
    return {success: false, issues};
  }

  return {
    success: true,
    value: {
      schemaVersion: 1,
      shortcuts,
      ...(startDestination === undefined ? {} : {startDestination}),
    },
  };
};

export const parseProductShellPreferences = (
  value: unknown,
): StoredProductShellPreferences => {
  const result = safeParseProductShellPreferences(value);
  if (!result.success) {
    throw new ProductShellValidationError(result.issues);
  }
  return result.value;
};
