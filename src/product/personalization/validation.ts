import {
  safeParseStoredDestinationTarget,
  type StoredDestinationTarget,
  type ValidationIssue,
} from '../destinations';
import {
  safeParseProductShellPreferences,
  type StoredProductShellPreferences,
} from '../shell';
import {
  MAX_PERSISTED_RECENT_MODULES,
  DAILY_OVERVIEW_CARD_IDS,
  PERSONALIZATION_LAYOUTS,
  PERSONALIZATION_QUESTIONNAIRE_STAGES,
  RELATIONSHIPS_TO_DATA_SUBJECT,
  type PersonalizationLayout,
  type PersonalizationQuestionnaireAnswers,
  type PersonalizationQuestionnaireStage,
  type RelationshipToDataSubject,
  type StoredAccountPersonalization,
  type StoredDevicePersonalization,
  type StoredDayGraphPreferences,
  type StoredDailyOverviewPreferences,
  type StoredLayoutPersonalization,
  type StoredLayoutProfile,
  type StoredProductPersonalization,
  type StoredQuestionnaireProgress,
  type StoredRecentModule,
  type StoredWorkspacePersonalization,
} from './types';

type PlainObject = Record<string, unknown>;

export type PersonalizationSafeParseResult<T> =
  | {readonly success: true; readonly value: T}
  | {readonly success: false; readonly issues: readonly ValidationIssue[]};

export class ProductPersonalizationValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(message);
    this.name = 'ProductPersonalizationValidationError';
    this.issues = issues;
  }
}

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T => typeof value === 'string' && allowed.includes(value as T);

const rejectUnknownKeys = (
  value: PlainObject,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
) => {
  Object.keys(value).forEach(key => {
    if (!allowed.includes(key)) {
      issues.push({path: `${path}.${key}`, message: 'Unknown field'});
    }
  });
};

const requireSchemaVersion = (
  value: PlainObject,
  path: string,
  issues: ValidationIssue[],
) => {
  if (value.schemaVersion !== 1) {
    issues.push({
      path: `${path}.schemaVersion`,
      message: 'Unsupported schema version',
    });
  }
};

const prefixIssue = (
  issue: ValidationIssue,
  sourceRoot: string,
  targetRoot: string,
): ValidationIssue => ({
  path:
    issue.path === sourceRoot
      ? targetRoot
      : issue.path.replace(sourceRoot, targetRoot),
  message: issue.message,
});

const parseTargetAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredDestinationTarget | undefined => {
  const result = safeParseStoredDestinationTarget(value);
  if (!result.success) {
    issues.push(
      ...result.issues.map(issue => prefixIssue(issue, 'target', path)),
    );
    return undefined;
  }
  return result.value;
};

const parseTargetList = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly StoredDestinationTarget[] => {
  if (!Array.isArray(value)) {
    issues.push({path, message: 'Expected an array'});
    return [];
  }

  const targets: StoredDestinationTarget[] = [];
  const seen = new Set<string>();
  value.forEach((candidate, index) => {
    const target = parseTargetAt(candidate, `${path}[${index}]`, issues);
    if (!target) {
      return;
    }
    if (seen.has(target.destinationId)) {
      issues.push({
        path: `${path}[${index}]`,
        message: 'A destination can appear only once',
      });
      return;
    }
    seen.add(target.destinationId);
    targets.push(target);
  });
  return targets;
};

const parseShellAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredProductShellPreferences | undefined => {
  const result = safeParseProductShellPreferences(value);
  if (!result.success) {
    issues.push(
      ...result.issues.map(issue => prefixIssue(issue, 'shell', path)),
    );
    return undefined;
  }
  return result.value;
};

const readRelationship = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): RelationshipToDataSubject | undefined => {
  if (!isOneOf(value, RELATIONSHIPS_TO_DATA_SUBJECT)) {
    issues.push({path, message: 'Unknown relationship'});
    return undefined;
  }
  return value;
};

const readLayout = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PersonalizationLayout | undefined => {
  if (!isOneOf(value, PERSONALIZATION_LAYOUTS)) {
    issues.push({path, message: 'Unknown layout'});
    return undefined;
  }
  return value;
};

const readBoolean = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): boolean => {
  if (typeof value !== 'boolean') {
    issues.push({path, message: 'Expected a boolean'});
    return false;
  }
  return value;
};

const parseQuestionnaireProgressAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredQuestionnaireProgress => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected questionnaire progress'});
    return {schemaVersion: 1, status: 'not-started'};
  }
  rejectUnknownKeys(
    value,
    ['schemaVersion', 'status', 'currentStage'],
    path,
    issues,
  );
  requireSchemaVersion(value, path, issues);

  if (value.status === 'in-progress') {
    if (!isOneOf(value.currentStage, PERSONALIZATION_QUESTIONNAIRE_STAGES)) {
      issues.push({
        path: `${path}.currentStage`,
        message: 'Unknown questionnaire stage',
      });
      return {
        schemaVersion: 1,
        status: 'in-progress',
        currentStage: 'relationship',
      };
    }
    return {
      schemaVersion: 1,
      status: 'in-progress',
      currentStage: value.currentStage,
    };
  }

  if (
    value.status !== 'not-started' &&
    value.status !== 'completed' &&
    value.status !== 'skipped'
  ) {
    issues.push({
      path: `${path}.status`,
      message: 'Unknown questionnaire status',
    });
  }
  if (value.currentStage !== undefined) {
    issues.push({
      path: `${path}.currentStage`,
      message: 'Only an in-progress questionnaire has a current stage',
    });
  }
  return {
    schemaVersion: 1,
    status:
      value.status === 'completed' || value.status === 'skipped'
        ? value.status
        : 'not-started',
  };
};

const parseAccountAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredAccountPersonalization => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected account personalization'});
    return {schemaVersion: 1, favorites: [], hiddenModules: []};
  }
  rejectUnknownKeys(
    value,
    ['schemaVersion', 'favorites', 'hiddenModules'],
    path,
    issues,
  );
  requireSchemaVersion(value, path, issues);
  return {
    schemaVersion: 1,
    favorites: parseTargetList(value.favorites, `${path}.favorites`, issues),
    // V1 snapshots written before Module visibility existed migrate to the
    // backwards-compatible default: every Module remains visible.
    hiddenModules:
      value.hiddenModules === undefined
        ? []
        : parseTargetList(value.hiddenModules, `${path}.hiddenModules`, issues),
  };
};

const parseWorkspaceAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredWorkspacePersonalization => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected Workspace personalization'});
    return {
      schemaVersion: 1,
      questionnaire: {schemaVersion: 1, status: 'not-started'},
    };
  }
  rejectUnknownKeys(
    value,
    ['schemaVersion', 'questionnaire', 'relationship'],
    path,
    issues,
  );
  requireSchemaVersion(value, path, issues);
  const relationship =
    value.relationship === undefined
      ? undefined
      : readRelationship(value.relationship, `${path}.relationship`, issues);
  const questionnaire = parseQuestionnaireProgressAt(
    value.questionnaire,
    `${path}.questionnaire`,
    issues,
  );
  if (questionnaire.status === 'completed' && relationship === undefined) {
    issues.push({
      path: `${path}.relationship`,
      message: 'A completed questionnaire requires a relationship',
    });
  }
  return {
    schemaVersion: 1,
    questionnaire,
    ...(relationship === undefined ? {} : {relationship}),
  };
};

const parseDayGraphPreferencesAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredDayGraphPreferences | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected Day Graph preferences'});
    return undefined;
  }
  rejectUnknownKeys(
    value,
    ['schemaVersion', 'mode', 'windowHours'],
    path,
    issues,
  );
  requireSchemaVersion(value, path, issues);
  const {mode, windowHours} = value;
  if (mode !== 'separate' && mode !== 'mixed') {
    issues.push({path: `${path}.mode`, message: 'Unknown chart mode'});
    return undefined;
  }
  if (
    windowHours !== 'full-day' &&
    windowHours !== 3 &&
    windowHours !== 6 &&
    windowHours !== 12
  ) {
    issues.push({
      path: `${path}.windowHours`,
      message: 'Unsupported chart window',
    });
    return undefined;
  }
  return {schemaVersion: 1, mode, windowHours};
};

const parseDailyOverviewPreferencesAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredDailyOverviewPreferences | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected Daily Overview preferences'});
    return undefined;
  }
  rejectUnknownKeys(
    value,
    ['schemaVersion', 'rangeStyle', 'cardOrder'],
    path,
    issues,
  );
  requireSchemaVersion(value, path, issues);
  const {rangeStyle, cardOrder} = value;
  if (rangeStyle !== 'ring' && rangeStyle !== 'bar' && rangeStyle !== 'list') {
    issues.push({path: `${path}.rangeStyle`, message: 'Unknown range style'});
    return undefined;
  }
  if (
    !Array.isArray(cardOrder) ||
    cardOrder.length !== DAILY_OVERVIEW_CARD_IDS.length ||
    !DAILY_OVERVIEW_CARD_IDS.every(id => cardOrder.includes(id))
  ) {
    issues.push({
      path: `${path}.cardOrder`,
      message: 'Expected every Daily Overview card exactly once',
    });
    return undefined;
  }
  return {schemaVersion: 1, rangeStyle, cardOrder: [...cardOrder]};
};

const parseLayoutProfileAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredLayoutProfile | undefined => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected a Layout Profile'});
    return undefined;
  }
  rejectUnknownKeys(
    value,
    [
      'schemaVersion',
      'layout',
      'showCurrentSnapshot',
      'showRecents',
      'showGri',
      'shell',
      'dayGraph',
      'dailyOverview',
    ],
    path,
    issues,
  );
  requireSchemaVersion(value, path, issues);
  const layout = readLayout(value.layout, `${path}.layout`, issues);
  const shell = parseShellAt(value.shell, `${path}.shell`, issues);
  const dayGraph = parseDayGraphPreferencesAt(
    value.dayGraph,
    `${path}.dayGraph`,
    issues,
  );
  const dailyOverview = parseDailyOverviewPreferencesAt(
    value.dailyOverview,
    `${path}.dailyOverview`,
    issues,
  );
  if (!layout || !shell) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    layout,
    showCurrentSnapshot: readBoolean(
      value.showCurrentSnapshot,
      `${path}.showCurrentSnapshot`,
      issues,
    ),
    showRecents: readBoolean(value.showRecents, `${path}.showRecents`, issues),
    showGri: readBoolean(value.showGri ?? false, `${path}.showGri`, issues),
    shell,
    ...(dayGraph === undefined ? {} : {dayGraph}),
    ...(dailyOverview === undefined ? {} : {dailyOverview}),
  };
};

const parseLayoutAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredLayoutPersonalization => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected Layout personalization'});
    return {schemaVersion: 1, profiles: []};
  }
  rejectUnknownKeys(value, ['schemaVersion', 'profiles'], path, issues);
  requireSchemaVersion(value, path, issues);

  if (!Array.isArray(value.profiles)) {
    issues.push({path: `${path}.profiles`, message: 'Expected an array'});
    return {schemaVersion: 1, profiles: []};
  }

  const profiles = value.profiles
    .map((profile, index) =>
      parseLayoutProfileAt(profile, `${path}.profiles[${index}]`, issues),
    )
    .filter((profile): profile is StoredLayoutProfile => profile !== undefined);
  const counts = new Map<PersonalizationLayout, number>();
  profiles.forEach(profile =>
    counts.set(profile.layout, (counts.get(profile.layout) ?? 0) + 1),
  );
  PERSONALIZATION_LAYOUTS.forEach(layout => {
    const count = counts.get(layout) ?? 0;
    if (count !== 1) {
      issues.push({
        path: `${path}.profiles`,
        message:
          count === 0
            ? `Missing ${layout} Layout Profile`
            : `Duplicate ${layout} Layout Profile`,
      });
    }
  });
  return {schemaVersion: 1, profiles};
};

const parseRecentModuleAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredRecentModule | undefined => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected a Recent Module'});
    return undefined;
  }
  rejectUnknownKeys(
    value,
    ['schemaVersion', 'target', 'visitedAt'],
    path,
    issues,
  );
  requireSchemaVersion(value, path, issues);
  const target = parseTargetAt(value.target, `${path}.target`, issues);
  if (
    typeof value.visitedAt !== 'number' ||
    !Number.isSafeInteger(value.visitedAt) ||
    value.visitedAt < 0
  ) {
    issues.push({
      path: `${path}.visitedAt`,
      message: 'Expected a non-negative integer timestamp',
    });
  }
  if (!target) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    target,
    visitedAt:
      typeof value.visitedAt === 'number' &&
      Number.isSafeInteger(value.visitedAt)
        ? Math.max(0, value.visitedAt)
        : 0,
  };
};

const parseDeviceAt = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): StoredDevicePersonalization => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected device personalization'});
    return {schemaVersion: 1, recentModules: []};
  }
  rejectUnknownKeys(value, ['schemaVersion', 'recentModules'], path, issues);
  requireSchemaVersion(value, path, issues);
  if (!Array.isArray(value.recentModules)) {
    issues.push({path: `${path}.recentModules`, message: 'Expected an array'});
    return {schemaVersion: 1, recentModules: []};
  }

  const seen = new Set<string>();
  const recents: StoredRecentModule[] = [];
  value.recentModules.forEach((recent, index) => {
    const parsed = parseRecentModuleAt(
      recent,
      `${path}.recentModules[${index}]`,
      issues,
    );
    if (!parsed) {
      return;
    }
    if (seen.has(parsed.target.destinationId)) {
      issues.push({
        path: `${path}.recentModules[${index}].target`,
        message: 'A Recent Module can appear only once',
      });
      return;
    }
    seen.add(parsed.target.destinationId);
    if (recents.length < MAX_PERSISTED_RECENT_MODULES) {
      recents.push(parsed);
    }
  });
  return {schemaVersion: 1, recentModules: recents};
};

export const safeParseStoredLayoutProfile = (
  value: unknown,
): PersonalizationSafeParseResult<StoredLayoutProfile> => {
  const issues: ValidationIssue[] = [];
  const profile = parseLayoutProfileAt(value, 'layoutProfile', issues);
  return issues.length > 0 || !profile
    ? {success: false, issues}
    : {success: true, value: profile};
};

export const parseStoredLayoutProfile = (
  value: unknown,
): StoredLayoutProfile => {
  const result = safeParseStoredLayoutProfile(value);
  if (!result.success) {
    throw new ProductPersonalizationValidationError(
      'Layout Profile is invalid',
      result.issues,
    );
  }
  return result.value;
};

export const safeParseStoredAccountPersonalization = (
  value: unknown,
): PersonalizationSafeParseResult<StoredAccountPersonalization> => {
  const issues: ValidationIssue[] = [];
  const account = parseAccountAt(value, 'account', issues);
  return issues.length > 0
    ? {success: false, issues}
    : {success: true, value: account};
};

export const parseStoredAccountPersonalization = (
  value: unknown,
): StoredAccountPersonalization => {
  const result = safeParseStoredAccountPersonalization(value);
  if (!result.success) {
    throw new ProductPersonalizationValidationError(
      'Account personalization is invalid',
      result.issues,
    );
  }
  return result.value;
};

export const safeParseStoredWorkspacePersonalization = (
  value: unknown,
): PersonalizationSafeParseResult<StoredWorkspacePersonalization> => {
  const issues: ValidationIssue[] = [];
  const workspace = parseWorkspaceAt(value, 'workspace', issues);
  return issues.length > 0
    ? {success: false, issues}
    : {success: true, value: workspace};
};

export const parseStoredWorkspacePersonalization = (
  value: unknown,
): StoredWorkspacePersonalization => {
  const result = safeParseStoredWorkspacePersonalization(value);
  if (!result.success) {
    throw new ProductPersonalizationValidationError(
      'Workspace personalization is invalid',
      result.issues,
    );
  }
  return result.value;
};

export const safeParseStoredProductPersonalization = (
  value: unknown,
): PersonalizationSafeParseResult<StoredProductPersonalization> => {
  if (!isPlainObject(value)) {
    return {
      success: false,
      issues: [
        {path: 'personalization', message: 'Expected personalization object'},
      ],
    };
  }
  const issues: ValidationIssue[] = [];
  rejectUnknownKeys(
    value,
    ['schemaVersion', 'account', 'workspace', 'layout', 'device'],
    'personalization',
    issues,
  );
  requireSchemaVersion(value, 'personalization', issues);
  const parsed: StoredProductPersonalization = {
    schemaVersion: 1,
    account: parseAccountAt(value.account, 'personalization.account', issues),
    workspace: parseWorkspaceAt(
      value.workspace,
      'personalization.workspace',
      issues,
    ),
    layout: parseLayoutAt(value.layout, 'personalization.layout', issues),
    device: parseDeviceAt(value.device, 'personalization.device', issues),
  };
  return issues.length > 0
    ? {success: false, issues}
    : {success: true, value: parsed};
};

export const parseStoredProductPersonalization = (
  value: unknown,
): StoredProductPersonalization => {
  const result = safeParseStoredProductPersonalization(value);
  if (!result.success) {
    throw new ProductPersonalizationValidationError(
      'Product personalization is invalid',
      result.issues,
    );
  }
  return result.value;
};

const parseRelationshipStage = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected relationship stage answers'});
    return undefined;
  }
  rejectUnknownKeys(value, ['schemaVersion', 'relationship'], path, issues);
  requireSchemaVersion(value, path, issues);
  const relationship = readRelationship(
    value.relationship,
    `${path}.relationship`,
    issues,
  );
  return relationship ? {schemaVersion: 1 as const, relationship} : undefined;
};

const parseQuickAccessStage = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected quick-access stage answers'});
    return {schemaVersion: 1 as const, favorites: []};
  }
  rejectUnknownKeys(value, ['schemaVersion', 'favorites'], path, issues);
  requireSchemaVersion(value, path, issues);
  return {
    schemaVersion: 1 as const,
    favorites: parseTargetList(value.favorites, `${path}.favorites`, issues),
  };
};

const parsePresentationStage = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected presentation stage answers'});
    return undefined;
  }
  return parseLayoutProfileAt(value, path, issues);
};

export const safeParsePersonalizationQuestionnaireAnswers = (
  value: unknown,
): PersonalizationSafeParseResult<PersonalizationQuestionnaireAnswers> => {
  if (!isPlainObject(value)) {
    return {
      success: false,
      issues: [
        {path: 'questionnaire', message: 'Expected questionnaire answers'},
      ],
    };
  }
  const issues: ValidationIssue[] = [];
  rejectUnknownKeys(
    value,
    ['schemaVersion', 'relationship', 'quickAccess', 'presentation'],
    'questionnaire',
    issues,
  );
  requireSchemaVersion(value, 'questionnaire', issues);
  const relationship = parseRelationshipStage(
    value.relationship,
    'questionnaire.relationship',
    issues,
  );
  const quickAccess = parseQuickAccessStage(
    value.quickAccess,
    'questionnaire.quickAccess',
    issues,
  );
  const presentation = parsePresentationStage(
    value.presentation,
    'questionnaire.presentation',
    issues,
  );
  return issues.length > 0 || !relationship || !presentation
    ? {success: false, issues}
    : {
        success: true,
        value: {
          schemaVersion: 1,
          relationship,
          quickAccess,
          presentation,
        },
      };
};

export const parsePersonalizationQuestionnaireAnswers = (
  value: unknown,
): PersonalizationQuestionnaireAnswers => {
  const result = safeParsePersonalizationQuestionnaireAnswers(value);
  if (!result.success) {
    throw new ProductPersonalizationValidationError(
      'Personalization questionnaire answers are invalid',
      result.issues,
    );
  }
  return result.value;
};

export const isPersonalizationQuestionnaireStage = (
  value: unknown,
): value is PersonalizationQuestionnaireStage =>
  isOneOf(value, PERSONALIZATION_QUESTIONNAIRE_STAGES);
