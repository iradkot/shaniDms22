import {
  DESTINATION_GROUPS,
  DESTINATION_PLATFORMS,
  DESTINATION_TARGET_PURPOSES,
  DestinationDefinition,
  DestinationGroupId,
  DestinationId,
  DestinationPlatform,
  DestinationTargetPurpose,
  ChildDestinationDefinition,
  ModuleDestinationDefinition,
  StoredDestinationTarget,
} from './types';

const DESTINATION_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const IMPLEMENTATION_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

type PlainObject = Record<string, unknown>;

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class DestinationValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(message);
    this.name = 'DestinationValidationError';
    this.issues = issues;
  }
}

export type SafeParseResult<T> =
  | {readonly success: true; readonly value: T}
  | {readonly success: false; readonly issues: readonly ValidationIssue[]};

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <T extends string>(
  value: unknown,
  values: readonly T[],
): value is T => typeof value === 'string' && values.includes(value as T);

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

const readNonEmptyString = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push({path, message: 'Expected a non-empty string'});
    return '';
  }
  return value.trim();
};

export const isDestinationId = (value: unknown): value is DestinationId =>
  typeof value === 'string' && DESTINATION_ID_PATTERN.test(value);

export const destinationId = (value: string): DestinationId => {
  if (!isDestinationId(value)) {
    throw new DestinationValidationError('Invalid destination ID', [
      {
        path: 'destinationId',
        message: 'Expected a lowercase namespaced ID such as "core.day-graph"',
      },
    ]);
  }
  return value;
};

const readDestinationId = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): DestinationId => {
  if (!isDestinationId(value)) {
    issues.push({
      path,
      message: 'Expected a lowercase namespaced destination ID',
    });
    return '' as DestinationId;
  }
  return value;
};

const readCopy = (value: unknown, path: string, issues: ValidationIssue[]) => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected English and Hebrew copy'});
    return {
      en: {title: '', description: ''},
      he: {title: '', description: ''},
    };
  }

  rejectUnknownKeys(value, ['en', 'he'], path, issues);

  const readLocale = (locale: 'en' | 'he') => {
    const localized = value[locale];
    const localizedPath = `${path}.${locale}`;
    if (!isPlainObject(localized)) {
      issues.push({path: localizedPath, message: 'Expected localized copy'});
      return {title: '', description: ''};
    }
    rejectUnknownKeys(
      localized,
      ['title', 'description'],
      localizedPath,
      issues,
    );
    return {
      title: readNonEmptyString(
        localized.title,
        `${localizedPath}.title`,
        issues,
      ),
      description: readNonEmptyString(
        localized.description,
        `${localizedPath}.description`,
        issues,
      ),
    };
  };

  return {en: readLocale('en'), he: readLocale('he')};
};

const readTargetPolicy = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected a target policy'});
    return {favorite: false, start: false, shortcut: false};
  }

  rejectUnknownKeys(value, DESTINATION_TARGET_PURPOSES, path, issues);
  const result = {
    favorite: false,
    start: false,
    shortcut: false,
  };
  DESTINATION_TARGET_PURPOSES.forEach(purpose => {
    if (typeof value[purpose] !== 'boolean') {
      issues.push({
        path: `${path}.${purpose}`,
        message: 'Expected a boolean',
      });
      return;
    }
    result[purpose] = value[purpose] as boolean;
  });
  return result;
};

const readAvailability = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) => {
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected an availability policy'});
    return {platforms: [] as DestinationPlatform[], requiredCapabilities: []};
  }

  rejectUnknownKeys(value, ['platforms', 'requiredCapabilities'], path, issues);

  const platforms: DestinationPlatform[] = [];
  if (!Array.isArray(value.platforms) || value.platforms.length === 0) {
    issues.push({
      path: `${path}.platforms`,
      message: 'Expected at least one supported platform',
    });
  } else {
    value.platforms.forEach((platform, index) => {
      if (!isOneOf(platform, DESTINATION_PLATFORMS)) {
        issues.push({
          path: `${path}.platforms[${index}]`,
          message: 'Unknown platform',
        });
      } else if (!platforms.includes(platform)) {
        platforms.push(platform);
      }
    });
  }

  const requiredCapabilities: string[] = [];
  if (!Array.isArray(value.requiredCapabilities)) {
    issues.push({
      path: `${path}.requiredCapabilities`,
      message: 'Expected an array',
    });
  } else {
    value.requiredCapabilities.forEach((capability, index) => {
      if (
        typeof capability !== 'string' ||
        !CAPABILITY_PATTERN.test(capability)
      ) {
        issues.push({
          path: `${path}.requiredCapabilities[${index}]`,
          message: 'Expected a namespaced capability ID',
        });
      } else if (!requiredCapabilities.includes(capability)) {
        requiredCapabilities.push(capability);
      }
    });
  }

  return {platforms, requiredCapabilities};
};

const readAliases = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    issues.push({path, message: 'Expected an array'});
    return undefined;
  }
  const aliases: DestinationId[] = [];
  value.forEach((alias, index) => {
    const parsed = readDestinationId(alias, `${path}[${index}]`, issues);
    if (parsed && !aliases.includes(parsed)) {
      aliases.push(parsed);
    }
  });
  return aliases;
};

const parseDefinition = (
  value: unknown,
  index: number,
  issues: ValidationIssue[],
): DestinationDefinition | undefined => {
  const path = `destinations[${index}]`;
  if (!isPlainObject(value)) {
    issues.push({path, message: 'Expected a destination object'});
    return undefined;
  }

  rejectUnknownKeys(
    value,
    [
      'id',
      'kind',
      'ownerModuleId',
      'implementationKey',
      'group',
      'order',
      'copy',
      'targetPolicy',
      'availability',
      'aliases',
    ],
    path,
    issues,
  );

  const id = readDestinationId(value.id, `${path}.id`, issues);
  const ownerModuleId = readDestinationId(
    value.ownerModuleId,
    `${path}.ownerModuleId`,
    issues,
  );
  const implementationKey = readNonEmptyString(
    value.implementationKey,
    `${path}.implementationKey`,
    issues,
  );
  if (
    implementationKey &&
    !IMPLEMENTATION_KEY_PATTERN.test(implementationKey)
  ) {
    issues.push({
      path: `${path}.implementationKey`,
      message: 'Implementation key contains unsupported characters',
    });
  }

  const order = value.order;
  if (!Number.isSafeInteger(order) || (order as number) < 0) {
    issues.push({
      path: `${path}.order`,
      message: 'Expected a non-negative integer',
    });
  }

  const copy = readCopy(value.copy, `${path}.copy`, issues);
  const targetPolicy = readTargetPolicy(
    value.targetPolicy,
    `${path}.targetPolicy`,
    issues,
  );
  const availability = readAvailability(
    value.availability,
    `${path}.availability`,
    issues,
  );
  const aliases = readAliases(value.aliases, `${path}.aliases`, issues);
  const common = {
    id,
    ownerModuleId,
    implementationKey,
    order: typeof order === 'number' ? order : 0,
    copy,
    targetPolicy,
    availability,
    ...(aliases === undefined ? {} : {aliases}),
  };

  if (value.kind === 'module') {
    if (!isOneOf(value.group, DESTINATION_GROUPS)) {
      issues.push({path: `${path}.group`, message: 'Unknown module group'});
    }
    const definition: ModuleDestinationDefinition = {
      ...common,
      kind: 'module',
      group: value.group as DestinationGroupId,
    };
    return definition;
  }

  if (value.kind === 'module-child') {
    if (value.group !== undefined) {
      issues.push({
        path: `${path}.group`,
        message: 'Child destinations inherit their owner module group',
      });
    }
    const definition: ChildDestinationDefinition = {
      ...common,
      kind: 'module-child',
    };
    return definition;
  }

  issues.push({
    path: `${path}.kind`,
    message: 'Expected "module" or "module-child"',
  });
  return undefined;
};

/** Validates the whole contribution before any destination can be installed. */
export const safeParseDestinationDefinitions = (
  value: unknown,
): SafeParseResult<readonly DestinationDefinition[]> => {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(value)) {
    return {
      success: false,
      issues: [{path: 'destinations', message: 'Expected an array'}],
    };
  }

  const parsed = value
    .map((definition, index) => parseDefinition(definition, index, issues))
    .filter((definition): definition is DestinationDefinition => !!definition);

  const ids = new Map<string, number>();
  const aliases = new Map<string, number>();
  parsed.forEach((definition, index) => {
    const existing = ids.get(definition.id);
    if (existing !== undefined) {
      issues.push({
        path: `destinations[${index}].id`,
        message: `Duplicate destination ID; first declared at index ${existing}`,
      });
    } else {
      ids.set(definition.id, index);
    }
  });

  parsed.forEach((definition, index) => {
    definition.aliases?.forEach(alias => {
      if (alias === definition.id) {
        issues.push({
          path: `destinations[${index}].aliases`,
          message: 'A destination cannot alias itself',
        });
      }
      const existingAlias = aliases.get(alias);
      if (ids.has(alias) || existingAlias !== undefined) {
        issues.push({
          path: `destinations[${index}].aliases`,
          message: 'Alias collides with a destination ID or another alias',
        });
      } else {
        aliases.set(alias, index);
      }
    });
  });

  parsed.forEach((definition, index) => {
    const owner = parsed.find(
      candidate => candidate.id === definition.ownerModuleId,
    );
    if (!owner || owner.kind !== 'module') {
      issues.push({
        path: `destinations[${index}].ownerModuleId`,
        message:
          'Owner must reference a module in the same atomic contribution',
      });
    }
    if (
      definition.kind === 'module' &&
      definition.ownerModuleId !== definition.id
    ) {
      issues.push({
        path: `destinations[${index}].ownerModuleId`,
        message: 'A module must own itself',
      });
    }
  });

  return issues.length > 0
    ? {success: false, issues}
    : {success: true, value: parsed};
};

export const parseDestinationDefinitions = (
  value: unknown,
): readonly DestinationDefinition[] => {
  const result = safeParseDestinationDefinitions(value);
  if (!result.success) {
    throw new DestinationValidationError(
      'Destination contribution is invalid',
      result.issues,
    );
  }
  return result.value;
};

export const safeParseStoredDestinationTarget = (
  value: unknown,
): SafeParseResult<StoredDestinationTarget> => {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    return {
      success: false,
      issues: [{path: 'target', message: 'Expected a target object'}],
    };
  }

  rejectUnknownKeys(
    value,
    ['schemaVersion', 'destinationId'],
    'target',
    issues,
  );
  if (value.schemaVersion !== 1) {
    issues.push({
      path: 'target.schemaVersion',
      message: 'Unsupported schema version',
    });
  }
  const parsedId = readDestinationId(
    value.destinationId,
    'target.destinationId',
    issues,
  );

  return issues.length > 0
    ? {success: false, issues}
    : {
        success: true,
        value: {schemaVersion: 1, destinationId: parsedId},
      };
};

export const parseStoredDestinationTarget = (
  value: unknown,
): StoredDestinationTarget => {
  const result = safeParseStoredDestinationTarget(value);
  if (!result.success) {
    throw new DestinationValidationError(
      'Stored destination target is invalid',
      result.issues,
    );
  }
  return result.value;
};

export const isDestinationTargetPurpose = (
  value: unknown,
): value is DestinationTargetPurpose =>
  isOneOf(value, DESTINATION_TARGET_PURPOSES);
