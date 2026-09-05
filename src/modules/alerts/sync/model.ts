import {
  ALERT_RULE_TRENDS,
  type AlertRule,
  type AlertRuleInput,
  type AlertRuleTrend,
  validateAlertRuleInput,
} from '../domain/alertRules';
import {
  isUpdateDeepLinkDescriptor,
  type UpdateCenterItem,
  type UpdateContent,
  type UpdateDeepLinkDescriptor,
} from '../domain/updates';

export interface AlertSyncScope {
  readonly ownerProductUserId: string;
  readonly workspaceId: string;
}

export interface AlertRuleSyncMutation {
  readonly schemaVersion: 1;
  readonly mutationKind: 'alert_rule';
  readonly ownerProductUserId: string;
  readonly workspaceId: string;
  readonly ruleId: string;
  readonly baseRevision: number;
  readonly mutationId: string;
  readonly changedAtMs: number;
  readonly deleted: boolean;
  readonly value?: AlertRuleInput;
}

export interface RemoteAlertRuleRecord {
  readonly schemaVersion: 1;
  readonly documentKind: 'alert_rule';
  readonly ownerProductUserId: string;
  readonly workspaceId: string;
  readonly ruleId: string;
  readonly revision: number;
  readonly mutationId: string;
  readonly changedAtMs: number;
  readonly deleted: boolean;
  readonly value?: AlertRuleInput;
}

export interface ImmutableUpdateRecord {
  readonly schemaVersion: 1;
  readonly documentKind: 'update_center_record';
  readonly ownerProductUserId: string;
  readonly workspaceId: string;
  readonly recordId: string;
  readonly kind: UpdateCenterItem['kind'];
  readonly occurredAtMs: number;
  readonly content: UpdateContent;
  readonly deepLink?: UpdateDeepLinkDescriptor;
}

export interface UpdateReadRecord {
  readonly schemaVersion: 1;
  readonly documentKind: 'update_center_read';
  readonly ownerProductUserId: string;
  readonly workspaceId: string;
  readonly itemId: string;
  readonly readAtMs: number;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactly = (
  value: UnknownRecord,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

export const isAlertSyncId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0;

const isRevision = (value: unknown, allowZero = false): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= (allowZero ? 0 : 1);

export const assertAlertSyncScope = (
  untrusted: AlertSyncScope,
): AlertSyncScope => {
  if (
    !isAlertSyncId(untrusted.ownerProductUserId) ||
    !isAlertSyncId(untrusted.workspaceId)
  ) {
    throw new Error('Alert sync scope is invalid.');
  }
  return {...untrusted};
};

const parseRuleValue = (value: unknown): AlertRuleInput => {
  if (!isRecord(value)) {
    throw new Error('Alert rule value is invalid.');
  }
  const trend = value.trend;
  if (
    typeof trend !== 'string' ||
    !(ALERT_RULE_TRENDS as readonly string[]).includes(trend)
  ) {
    throw new Error('Alert rule trend is invalid.');
  }
  const parsed = validateAlertRuleInput({
    name: typeof value.name === 'string' ? value.name : '',
    enabled: value.enabled === true,
    lowerBoundMgDl: Number(value.lowerBoundMgDl),
    upperBoundMgDl: Number(value.upperBoundMgDl),
    activeFromMinute: Number(value.activeFromMinute),
    activeToMinute: Number(value.activeToMinute),
    trend: trend as AlertRuleTrend,
  });
  if (
    !hasExactly(value, [
      'name',
      'enabled',
      'lowerBoundMgDl',
      'upperBoundMgDl',
      'activeFromMinute',
      'activeToMinute',
      'trend',
    ]) ||
    !parsed.ok
  ) {
    throw new Error('Alert rule value is invalid.');
  }
  return parsed.value;
};

const assertExpectedScope = (
  value: UnknownRecord,
  scope: AlertSyncScope,
): void => {
  if (
    value.ownerProductUserId !== scope.ownerProductUserId ||
    value.workspaceId !== scope.workspaceId
  ) {
    throw new Error('Alert sync record belongs to another scope.');
  }
};

export const parseAlertRuleSyncMutation = (
  untrusted: unknown,
  expectedScope: AlertSyncScope,
): AlertRuleSyncMutation => {
  const scope = assertAlertSyncScope(expectedScope);
  if (!isRecord(untrusted)) {
    throw new Error('Alert rule mutation is invalid.');
  }
  const keys = [
    'schemaVersion',
    'mutationKind',
    'ownerProductUserId',
    'workspaceId',
    'ruleId',
    'baseRevision',
    'mutationId',
    'changedAtMs',
    'deleted',
    ...(untrusted.deleted === true ? [] : ['value']),
  ];
  if (
    !hasExactly(untrusted, keys) ||
    untrusted.schemaVersion !== 1 ||
    untrusted.mutationKind !== 'alert_rule' ||
    !isAlertSyncId(untrusted.ruleId) ||
    !isRevision(untrusted.baseRevision, true) ||
    !isAlertSyncId(untrusted.mutationId) ||
    !isTimestamp(untrusted.changedAtMs) ||
    typeof untrusted.deleted !== 'boolean'
  ) {
    throw new Error('Alert rule mutation is invalid.');
  }
  assertExpectedScope(untrusted, scope);
  return {
    schemaVersion: 1,
    mutationKind: 'alert_rule',
    ownerProductUserId: scope.ownerProductUserId,
    workspaceId: scope.workspaceId,
    ruleId: untrusted.ruleId,
    baseRevision: untrusted.baseRevision,
    mutationId: untrusted.mutationId,
    changedAtMs: untrusted.changedAtMs,
    deleted: untrusted.deleted,
    ...(untrusted.deleted ? {} : {value: parseRuleValue(untrusted.value)}),
  };
};

export const parseRemoteAlertRuleRecord = (
  untrusted: unknown,
  expectedScope: AlertSyncScope,
): RemoteAlertRuleRecord => {
  const scope = assertAlertSyncScope(expectedScope);
  if (!isRecord(untrusted)) {
    throw new Error('Remote alert rule is invalid.');
  }
  const keys = [
    'schemaVersion',
    'documentKind',
    'ownerProductUserId',
    'workspaceId',
    'ruleId',
    'revision',
    'mutationId',
    'changedAtMs',
    'deleted',
    ...(untrusted.deleted === true ? [] : ['value']),
  ];
  if (
    !hasExactly(untrusted, keys) ||
    untrusted.schemaVersion !== 1 ||
    untrusted.documentKind !== 'alert_rule' ||
    !isAlertSyncId(untrusted.ruleId) ||
    !isRevision(untrusted.revision) ||
    !isAlertSyncId(untrusted.mutationId) ||
    !isTimestamp(untrusted.changedAtMs) ||
    typeof untrusted.deleted !== 'boolean'
  ) {
    throw new Error('Remote alert rule is invalid.');
  }
  assertExpectedScope(untrusted, scope);
  return {
    schemaVersion: 1,
    documentKind: 'alert_rule',
    ownerProductUserId: scope.ownerProductUserId,
    workspaceId: scope.workspaceId,
    ruleId: untrusted.ruleId,
    revision: untrusted.revision,
    mutationId: untrusted.mutationId,
    changedAtMs: untrusted.changedAtMs,
    deleted: untrusted.deleted,
    ...(untrusted.deleted ? {} : {value: parseRuleValue(untrusted.value)}),
  };
};

const parseUpdateContent = (untrusted: unknown): UpdateContent => {
  if (!isRecord(untrusted)) {
    throw new Error('Update content is invalid.');
  }
  if (
    untrusted.kind === 'message' &&
    hasExactly(
      untrusted,
      untrusted.body === undefined ? ['kind', 'title'] : ['kind', 'title', 'body'],
    ) &&
    typeof untrusted.title === 'string' &&
    untrusted.title.trim().length > 0 &&
    untrusted.title.length <= 160 &&
    (untrusted.body === undefined ||
      (typeof untrusted.body === 'string' && untrusted.body.length <= 2_000))
  ) {
    return untrusted.body === undefined
      ? {kind: 'message', title: untrusted.title.trim()}
      : {
          kind: 'message',
          title: untrusted.title.trim(),
          body: untrusted.body,
        };
  }
  if (
    untrusted.kind === 'alert-rule-trigger' &&
    hasExactly(untrusted, ['kind', 'ruleName']) &&
    typeof untrusted.ruleName === 'string' &&
    untrusted.ruleName.trim().length > 0 &&
    untrusted.ruleName.length <= 160
  ) {
    return {kind: 'alert-rule-trigger', ruleName: untrusted.ruleName.trim()};
  }
  if (
    untrusted.kind !== 'alert-rule-occurrence' ||
    !hasExactly(untrusted, ['kind', 'rule', 'observation']) ||
    !isRecord(untrusted.rule) ||
    !isRecord(untrusted.observation) ||
    !isAlertSyncId(untrusted.rule.id)
  ) {
    throw new Error('Update content is invalid.');
  }
  const rule = parseRuleValue({...untrusted.rule, enabled: true});
  if (
    !hasExactly(untrusted.rule, [
      'id',
      'name',
      'lowerBoundMgDl',
      'upperBoundMgDl',
      'activeFromMinute',
      'activeToMinute',
      'trend',
    ]) ||
    !hasExactly(
      untrusted.observation,
      untrusted.observation.trend === undefined
        ? ['valueMgDl']
        : ['valueMgDl', 'trend'],
    ) ||
    typeof untrusted.observation.valueMgDl !== 'number' ||
    !Number.isSafeInteger(untrusted.observation.valueMgDl) ||
    untrusted.observation.valueMgDl < 1 ||
    untrusted.observation.valueMgDl > 1_000 ||
    (untrusted.observation.trend !== undefined &&
      (!(typeof untrusted.observation.trend === 'string') ||
        !(ALERT_RULE_TRENDS as readonly string[]).includes(
          untrusted.observation.trend,
        )))
  ) {
    throw new Error('Alert occurrence content is invalid.');
  }
  return {
    kind: 'alert-rule-occurrence',
    rule: {
      id: untrusted.rule.id,
      name: rule.name,
      lowerBoundMgDl: rule.lowerBoundMgDl,
      upperBoundMgDl: rule.upperBoundMgDl,
      activeFromMinute: rule.activeFromMinute,
      activeToMinute: rule.activeToMinute,
      trend: rule.trend,
    },
    observation: {
      valueMgDl: untrusted.observation.valueMgDl,
      ...(untrusted.observation.trend === undefined
        ? {}
        : {trend: untrusted.observation.trend as AlertRuleTrend}),
    },
  };
};

export const parseImmutableUpdateRecord = (
  untrusted: unknown,
  expectedScope: AlertSyncScope,
): ImmutableUpdateRecord => {
  const scope = assertAlertSyncScope(expectedScope);
  if (!isRecord(untrusted)) {
    throw new Error('Update record is invalid.');
  }
  const keys = [
    'schemaVersion',
    'documentKind',
    'ownerProductUserId',
    'workspaceId',
    'recordId',
    'kind',
    'occurredAtMs',
    'content',
    ...(untrusted.deepLink === undefined ? [] : ['deepLink']),
  ];
  if (
    !hasExactly(untrusted, keys) ||
    untrusted.schemaVersion !== 1 ||
    untrusted.documentKind !== 'update_center_record' ||
    !isAlertSyncId(untrusted.recordId) ||
    (untrusted.kind !== 'alert' &&
      untrusted.kind !== 'reminder' &&
      untrusted.kind !== 'generated-update') ||
    !isTimestamp(untrusted.occurredAtMs) ||
    (untrusted.deepLink !== undefined &&
      !isUpdateDeepLinkDescriptor(untrusted.deepLink))
  ) {
    throw new Error('Update record is invalid.');
  }
  assertExpectedScope(untrusted, scope);
  return {
    schemaVersion: 1,
    documentKind: 'update_center_record',
    ownerProductUserId: scope.ownerProductUserId,
    workspaceId: scope.workspaceId,
    recordId: untrusted.recordId,
    kind: untrusted.kind,
    occurredAtMs: untrusted.occurredAtMs,
    content: parseUpdateContent(untrusted.content),
    ...(untrusted.deepLink === undefined
      ? {}
      : {deepLink: untrusted.deepLink}),
  };
};

export const parseUpdateReadRecord = (
  untrusted: unknown,
  expectedScope: AlertSyncScope,
): UpdateReadRecord => {
  const scope = assertAlertSyncScope(expectedScope);
  if (
    !isRecord(untrusted) ||
    !hasExactly(untrusted, [
      'schemaVersion',
      'documentKind',
      'ownerProductUserId',
      'workspaceId',
      'itemId',
      'readAtMs',
    ]) ||
    untrusted.schemaVersion !== 1 ||
    untrusted.documentKind !== 'update_center_read' ||
    !isAlertSyncId(untrusted.itemId) ||
    !isTimestamp(untrusted.readAtMs)
  ) {
    throw new Error('Update read record is invalid.');
  }
  assertExpectedScope(untrusted, scope);
  return {
    schemaVersion: 1,
    documentKind: 'update_center_read',
    ownerProductUserId: scope.ownerProductUserId,
    workspaceId: scope.workspaceId,
    itemId: untrusted.itemId,
    readAtMs: untrusted.readAtMs,
  };
};

export const compareRulePrecedence = (
  left: Pick<AlertRuleSyncMutation | RemoteAlertRuleRecord, 'changedAtMs' | 'mutationId'>,
  right: Pick<AlertRuleSyncMutation | RemoteAlertRuleRecord, 'changedAtMs' | 'mutationId'>,
): number =>
  left.changedAtMs === right.changedAtMs
    ? left.mutationId.localeCompare(right.mutationId)
    : left.changedAtMs - right.changedAtMs;

export const createRuleMutation = (input: {
  readonly scope: AlertSyncScope;
  readonly ruleId: string;
  readonly baseRevision: number;
  readonly mutationId: string;
  readonly changedAtMs: number;
  readonly value?: AlertRuleInput;
}): AlertRuleSyncMutation =>
  parseAlertRuleSyncMutation(
    {
      schemaVersion: 1,
      mutationKind: 'alert_rule',
      ...assertAlertSyncScope(input.scope),
      ruleId: input.ruleId,
      baseRevision: input.baseRevision,
      mutationId: input.mutationId,
      changedAtMs: input.changedAtMs,
      deleted: input.value === undefined,
      ...(input.value === undefined ? {} : {value: input.value}),
    },
    input.scope,
  );

export const toRemoteRuleRecord = (
  mutation: AlertRuleSyncMutation,
  revision: number,
): RemoteAlertRuleRecord =>
  parseRemoteAlertRuleRecord(
    {
      schemaVersion: 1,
      documentKind: 'alert_rule',
      ownerProductUserId: mutation.ownerProductUserId,
      workspaceId: mutation.workspaceId,
      ruleId: mutation.ruleId,
      revision,
      mutationId: mutation.mutationId,
      changedAtMs: mutation.changedAtMs,
      deleted: mutation.deleted,
      ...(mutation.deleted ? {} : {value: mutation.value}),
    },
    mutation,
  );

export const ruleRecordToDomain = (
  record: RemoteAlertRuleRecord,
  triggeredAtMs: readonly number[] = [],
): AlertRule | undefined =>
  record.deleted || record.value === undefined
    ? undefined
    : {...record.value, id: record.ruleId, triggeredAtMs: [...triggeredAtMs]};

export const updateItemToRecord = (
  scope: AlertSyncScope,
  item: UpdateCenterItem,
): ImmutableUpdateRecord =>
  parseImmutableUpdateRecord(
    {
      schemaVersion: 1,
      documentKind: 'update_center_record',
      ...assertAlertSyncScope(scope),
      recordId: item.id,
      kind: item.kind,
      occurredAtMs: item.occurredAtMs,
      content: item.content,
      ...(item.deepLink === undefined ? {} : {deepLink: item.deepLink}),
    },
    scope,
  );

export const updateRecordToItem = (
  record: ImmutableUpdateRecord,
  read: boolean,
): UpdateCenterItem => ({
  id: record.recordId,
  kind: record.kind,
  occurredAtMs: record.occurredAtMs,
  readState: read ? 'read' : 'unread',
  content: record.content,
  ...(record.deepLink === undefined ? {} : {deepLink: record.deepLink}),
});

export const canonicalAlertSyncValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalAlertSyncValue).join(',')}]`;
  }
  if (typeof value !== 'object' || value === null) {
    return JSON.stringify(value);
  }
  return `{${Object.entries(value)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, nested]) =>
        `${JSON.stringify(key)}:${canonicalAlertSyncValue(nested)}`,
    )
    .join(',')}}`;
};
