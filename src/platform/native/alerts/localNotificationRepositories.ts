import AsyncStorage from '@react-native-async-storage/async-storage';
import {sha1} from 'js-sha1';
import type {
  AlertRule,
  AlertRuleLocalReplica,
  AlertRuleInput,
  AlertRulesSnapshot,
  AlertRuleTrend,
  AppOwnedUpdateCenterRepository,
  NewUpdateCenterItem,
  UpdateCenterItem,
  UpdateCenterSnapshot,
  UpdateCenterLocalReplica,
  UpdateDeepLinkDescriptor,
} from '../../../modules/alerts';
import {
  ALERT_RULE_TRENDS,
  isUpdateDeepLinkDescriptor,
  projectLegacyRuleTriggerHistory,
  validateAlertRuleInput,
} from '../../../modules/alerts';
import {
  addNotificationRule,
  deleteNotificationRule,
  getNotificationRules,
  updateNotificationRule,
} from '../../../services/notifications/localNotificationsStore';
import type {NotificationStoreScope} from '../../../services/notifications/localNotificationsStore';
import type {
  NotificationRequest,
  NotificationResponse,
  TrendDirectionString,
} from '../../../types/notifications';

const LEGACY_UPDATE_HISTORY_KEY = 'product:update-center:history:v1';
const LEGACY_READ_STATE_KEY = 'product:update-center:legacy-state:v1';
const LEGACY_RULES_KEY = 'notifications:rules:v1';
const MAX_STORED_UPDATES = 250;

const LEGACY_TO_DOMAIN_TREND: Readonly<
  Record<TrendDirectionString, AlertRuleTrend>
> = {
  DoubleDown: 'double-down',
  SingleDown: 'single-down',
  FortyFiveDown: 'forty-five-down',
  Flat: 'any',
  FortyFiveUp: 'forty-five-up',
  SingleUp: 'single-up',
  DoubleUp: 'double-up',
  'NOT COMPUTABLE': 'any',
  'RATE OUT OF RANGE': 'any',
};

const DOMAIN_TO_LEGACY_TREND: Readonly<
  Record<AlertRuleTrend, TrendDirectionString>
> = {
  any: 'Flat',
  'double-down': 'DoubleDown',
  'single-down': 'SingleDown',
  'forty-five-down': 'FortyFiveDown',
  'forty-five-up': 'FortyFiveUp',
  'single-up': 'SingleUp',
  'double-up': 'DoubleUp',
};

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (
  value: unknown,
  maximumLength = 512,
): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= maximumLength;

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const isGlucoseMgDl = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= 1_000;

const isAlertRuleTrend = (value: unknown): value is AlertRuleTrend =>
  typeof value === 'string' &&
  (ALERT_RULE_TRENDS as readonly string[]).includes(value);

const validTimes = (value: unknown): readonly number[] =>
  Array.isArray(value) ? value.filter(isTimestamp) : [];

export const decodeLegacyAlertRule = (
  rule: NotificationResponse,
): AlertRule => {
  if (!isNonEmptyString(rule.id)) {
    throw new Error('A stored alert rule has no valid ID.');
  }
  const trend = LEGACY_TO_DOMAIN_TREND[rule.trend];
  if (!trend) {
    throw new Error(`Alert rule ${rule.id} has an unsupported trend.`);
  }
  const result = validateAlertRuleInput({
    name: String(rule.name ?? ''),
    enabled: Boolean(rule.enabled),
    lowerBoundMgDl: Number(rule.range_start),
    upperBoundMgDl: Number(rule.range_end),
    activeFromMinute: Number(rule.hour_from_in_minutes),
    activeToMinute: Number(rule.hour_to_in_minutes),
    trend,
  });
  if (!result.ok) {
    throw new Error(
      `Alert rule ${rule.id} is invalid: ${result.issues
        .map(issue => issue.code)
        .join(', ')}`,
    );
  }
  return {
    ...result.value,
    id: rule.id,
    triggeredAtMs: validTimes(rule.times_called),
  };
};

const encodeRule = (input: AlertRuleInput): NotificationRequest => {
  const result = validateAlertRuleInput(input);
  if (!result.ok) {
    throw new Error(
      `Invalid alert rule: ${result.issues
        .map(issue => issue.code)
        .join(', ')}`,
    );
  }
  return {
    name: result.value.name,
    enabled: result.value.enabled,
    range_start: result.value.lowerBoundMgDl,
    range_end: result.value.upperBoundMgDl,
    hour_from_in_minutes: result.value.activeFromMinute,
    hour_to_in_minutes: result.value.activeToMinute,
    trend: DOMAIN_TO_LEGACY_TREND[result.value.trend],
  };
};

export interface NativeAlertRulesOptions {
  /** Opaque product Workspace ID. Never pass a URL, email, or API token. */
  readonly scopeId?: string;
}

const rulesStorageKey = (scopeId: string | undefined): string =>
  scopedStorageKey(
    LEGACY_RULES_KEY,
    'notifications:rules',
    scopeId,
  );

const storageScope = (
  scopeId: string | undefined,
): NotificationStoreScope | undefined =>
  scopeId === undefined ? undefined : {scopeId};

const scopedStorageKey = (
  legacyKey: string,
  namespace: string,
  scopeId: string | undefined,
): string => {
  if (scopeId === undefined) {
    return legacyKey;
  }
  const normalized = scopeId.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(normalized)) {
    throw new Error('Alert repository scope is invalid.');
  }
  return `${namespace}:v2:${normalized}`;
};

export const createNativeAlertRulesLocalReplica = (
  options: NativeAlertRulesOptions = {},
): AlertRuleLocalReplica => {
  const scope = storageScope(options.scopeId);
  let snapshot: AlertRulesSnapshot = {status: 'loading'};
  let requestSequence = 0;
  const listeners = new Set<() => void>();
  const publish = (next: AlertRulesSnapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const load = async (showLoading: boolean) => {
    const request = requestSequence + 1;
    requestSequence = request;
    if (showLoading) {
      publish({status: 'loading'});
    }
    try {
      const rules = (await getNotificationRules(scope)).map(
        decodeLegacyAlertRule,
      );
      if (requestSequence === request) {
        publish({status: 'ready', rules});
      }
    } catch (error) {
      if (requestSequence === request) {
        publish({status: 'error'});
      }
      throw error;
    }
  };
  const readyRules = async (): Promise<readonly AlertRule[]> => {
    if (snapshot.status !== 'ready') {
      await load(false);
    }
    if (snapshot.status !== 'ready') {
      throw new Error('Alert rules could not be loaded.');
    }
    return snapshot.rules;
  };

  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    refresh: () => load(true),
    replaceFromSync: async rules => {
      const stored: NotificationResponse[] = rules.map(rule => ({
        ...encodeRule(rule),
        id: rule.id,
        related_user: null,
        times_called: [...rule.triggeredAtMs],
        time_read: rule.triggeredAtMs[rule.triggeredAtMs.length - 1] ?? 0,
      }));
      await AsyncStorage.setItem(
        rulesStorageKey(options.scopeId),
        JSON.stringify(stored),
      );
      await load(false);
    },
    add: async input => {
      const created = decodeLegacyAlertRule(
        await addNotificationRule(encodeRule(input), scope),
      );
      await load(false);
      return created;
    },
    update: async (ruleId, input) => {
      await updateNotificationRule(ruleId, encodeRule(input), scope);
      await load(false);
    },
    setEnabled: async (ruleId, enabled) => {
      const existing = (await readyRules()).find(rule => rule.id === ruleId);
      if (!existing) {
        throw new Error(`Alert rule not found: ${ruleId}`);
      }
      await updateNotificationRule(
        ruleId,
        encodeRule({...existing, enabled}),
        scope,
      );
      await load(false);
    },
    delete: async ruleId => {
      await deleteNotificationRule(ruleId, scope);
      await load(false);
    },
  };
};

interface StoredUpdateHistory {
  readonly schemaVersion: 1;
  readonly items: readonly UpdateCenterItem[];
}

interface StoredLegacyState {
  readonly schemaVersion: 1;
  readonly seenIds: readonly string[];
  readonly readIds: readonly string[];
}

const decodeDeepLink = (value: unknown): UpdateDeepLinkDescriptor | undefined =>
  value === undefined
    ? undefined
    : isUpdateDeepLinkDescriptor(value)
    ? value
    : undefined;

const decodeContent = (value: unknown): UpdateCenterItem['content'] | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    value.kind === 'message' &&
    isNonEmptyString(value.title, 160) &&
    (value.body === undefined ||
      (typeof value.body === 'string' && value.body.length <= 2_000))
  ) {
    return value.body === undefined
      ? {kind: 'message', title: value.title}
      : {kind: 'message', title: value.title, body: value.body};
  }
  if (
    value.kind === 'alert-rule-trigger' &&
    isNonEmptyString(value.ruleName, 160)
  ) {
    return {kind: 'alert-rule-trigger', ruleName: value.ruleName};
  }
  if (
    value.kind === 'alert-rule-occurrence' &&
    isRecord(value.rule) &&
    isRecord(value.observation) &&
    isNonEmptyString(value.rule.id) &&
    isAlertRuleTrend(value.rule.trend) &&
    isGlucoseMgDl(value.observation.valueMgDl) &&
    (value.observation.trend === undefined ||
      isAlertRuleTrend(value.observation.trend))
  ) {
    const validatedRule = validateAlertRuleInput({
      name: String(value.rule.name ?? ''),
      enabled: true,
      lowerBoundMgDl: Number(value.rule.lowerBoundMgDl),
      upperBoundMgDl: Number(value.rule.upperBoundMgDl),
      activeFromMinute: Number(value.rule.activeFromMinute),
      activeToMinute: Number(value.rule.activeToMinute),
      trend: value.rule.trend,
    });
    if (!validatedRule.ok) {
      return undefined;
    }
    return {
      kind: 'alert-rule-occurrence',
      rule: {
        id: value.rule.id,
        name: validatedRule.value.name,
        lowerBoundMgDl: validatedRule.value.lowerBoundMgDl,
        upperBoundMgDl: validatedRule.value.upperBoundMgDl,
        activeFromMinute: validatedRule.value.activeFromMinute,
        activeToMinute: validatedRule.value.activeToMinute,
        trend: validatedRule.value.trend,
      },
      observation: {
        valueMgDl: value.observation.valueMgDl,
        ...(value.observation.trend === undefined
          ? {}
          : {trend: value.observation.trend}),
      },
    };
  }
  return undefined;
};

const decodeUpdate = (value: unknown): UpdateCenterItem | undefined => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    (value.kind !== 'alert' &&
      value.kind !== 'reminder' &&
      value.kind !== 'generated-update') ||
    !isTimestamp(value.occurredAtMs) ||
    (value.readState !== 'read' && value.readState !== 'unread')
  ) {
    return undefined;
  }
  const content = decodeContent(value.content);
  const deepLink = decodeDeepLink(value.deepLink);
  if (!content || (value.deepLink !== undefined && !deepLink)) {
    return undefined;
  }
  return {
    id: value.id,
    kind: value.kind,
    occurredAtMs: value.occurredAtMs,
    readState: value.readState,
    content,
    ...(deepLink ? {deepLink} : {}),
  };
};

const readStoredHistory = async (
  key: string,
): Promise<readonly UpdateCenterItem[]> => {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const decoded: unknown = JSON.parse(raw);
    if (
      !isRecord(decoded) ||
      decoded.schemaVersion !== 1 ||
      !Array.isArray(decoded.items)
    ) {
      return [];
    }
    const items: UpdateCenterItem[] = [];
    decoded.items.forEach((item: unknown) => {
      const valid = decodeUpdate(item);
      if (valid) {
        items.push(valid);
      }
    });
    return items;
  } catch {
    return [];
  }
};

const writeStoredHistory = async (
  key: string,
  items: readonly UpdateCenterItem[],
): Promise<void> => {
  const payload: StoredUpdateHistory = {
    schemaVersion: 1,
    items: [...items]
      .sort((left, right) => right.occurredAtMs - left.occurredAtMs)
      .slice(0, MAX_STORED_UPDATES),
  };
  await AsyncStorage.setItem(key, JSON.stringify(payload));
};

const readLegacyState = async (key: string): Promise<{
  readonly initialized: boolean;
  readonly state: StoredLegacyState;
}> => {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return {
      initialized: false,
      state: {schemaVersion: 1, seenIds: [], readIds: []},
    };
  }
  try {
    const decoded: unknown = JSON.parse(raw);
    if (
      isRecord(decoded) &&
      decoded.schemaVersion === 1 &&
      Array.isArray(decoded.seenIds) &&
      Array.isArray(decoded.readIds)
    ) {
      return {
        initialized: true,
        state: {
          schemaVersion: 1,
          seenIds: decoded.seenIds.filter(value => isNonEmptyString(value)),
          readIds: decoded.readIds.filter(value => isNonEmptyString(value)),
        },
      };
    }
  } catch {
    // A corrupt migration marker is treated like a first projection.
  }
  return {
    initialized: false,
    state: {schemaVersion: 1, seenIds: [], readIds: []},
  };
};

const writeLegacyState = async (
  key: string,
  state: StoredLegacyState,
): Promise<void> => AsyncStorage.setItem(key, JSON.stringify(state));

export type NativeUpdateCenterRepository = AppOwnedUpdateCenterRepository;

export interface NativeUpdateCenterOptions {
  readonly createId?: () => string;
  /** Opaque product Workspace ID. Never pass a URL, email, or API token. */
  readonly scopeId?: string;
}

const defaultUpdateId = (): string =>
  `update-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const assertNewUpdate = (value: NewUpdateCenterItem): void => {
  if (
    (value.kind !== 'alert' &&
      value.kind !== 'reminder' &&
      value.kind !== 'generated-update') ||
    !isTimestamp(value.occurredAtMs) ||
    !decodeContent(value.content) ||
    (value.deepLink !== undefined &&
      !isUpdateDeepLinkDescriptor(value.deepLink)) ||
    (value.idempotencyKey !== undefined &&
      !/^[A-Za-z0-9._:-]{1,240}$/.test(value.idempotencyKey))
  ) {
    throw new Error('Invalid update-center item.');
  }
};

export const createNativeUpdateCenterLocalReplica = (
  options: NativeUpdateCenterOptions = {},
): UpdateCenterLocalReplica => {
  const scope = storageScope(options.scopeId);
  const updateHistoryKey = scopedStorageKey(
    LEGACY_UPDATE_HISTORY_KEY,
    'product:update-center:history',
    options.scopeId,
  );
  const readStateKey = scopedStorageKey(
    LEGACY_READ_STATE_KEY,
    'product:update-center:read-state',
    options.scopeId,
  );
  let snapshot: UpdateCenterSnapshot = {status: 'loading'};
  let requestSequence = 0;
  const listeners = new Set<() => void>();
  const createId = options.createId ?? defaultUpdateId;
  const publish = (next: UpdateCenterSnapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const load = async (showLoading: boolean) => {
    const request = requestSequence + 1;
    requestSequence = request;
    if (showLoading) {
      publish({status: 'loading'});
    }
    try {
      const [storedItems, legacyRules, legacyStateResult] = await Promise.all([
        readStoredHistory(updateHistoryKey),
        getNotificationRules(scope),
        readLegacyState(readStateKey),
      ]);
      const projected = projectLegacyRuleTriggerHistory(
        legacyRules.map(rule => ({
          ruleId: String(rule.id ?? ''),
          ruleName: String(rule.name ?? ''),
          triggeredAtMs: validTimes(rule.times_called),
        })),
      );
      const seenIds = new Set(legacyStateResult.state.seenIds);
      const readIds = new Set(legacyStateResult.state.readIds);
      const legacyItems = projected.map(item => ({
        ...item,
        readState: readIds.has(item.id)
          ? ('read' as const)
          : seenIds.has(item.id)
          ? ('unknown' as const)
          : legacyStateResult.initialized
          ? ('unread' as const)
          : ('unknown' as const),
      }));
      projected.forEach(item => seenIds.add(item.id));
      await writeLegacyState(readStateKey, {
        schemaVersion: 1,
        seenIds: [...seenIds],
        readIds: [...readIds],
      });
      const items = [...storedItems, ...legacyItems].sort(
        (left, right) => right.occurredAtMs - left.occurredAtMs,
      );
      if (requestSequence === request) {
        publish({status: 'ready', items});
      }
    } catch (error) {
      if (requestSequence === request) {
        publish({status: 'error'});
      }
      throw error;
    }
  };

  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    refresh: () => load(true),
    replaceFromSync: async items => {
      await writeStoredHistory(
        updateHistoryKey,
        items.filter(item => item.content.kind !== 'alert-rule-trigger'),
      );
      await load(false);
    },
    append: async input => {
      assertNewUpdate(input);
      const {idempotencyKey, ...contentInput} = input;
      const id = (
        idempotencyKey === undefined
          ? createId()
          : `update-${sha1(`${scope}\u0000${idempotencyKey}`)}`
      ).trim();
      if (!isNonEmptyString(id)) {
        throw new Error('Update ID generator returned an invalid ID.');
      }
      const stored = await readStoredHistory(updateHistoryKey);
      const existing = stored.find(item => item.id === id);
      if (existing !== undefined) {
        return existing;
      }
      const normalizedInput: NewUpdateCenterItem =
        contentInput.content.kind === 'alert-rule-occurrence'
          ? {
              ...contentInput,
              deepLink: {kind: 'alert-occurrence', occurrenceId: id},
            }
          : contentInput;
      const created: UpdateCenterItem = {
        ...normalizedInput,
        id,
        readState: 'unread',
      };
      await writeStoredHistory(updateHistoryKey, [created, ...stored]);
      await load(false);
      return created;
    },
    markRead: async itemId => {
      const stored = await readStoredHistory(updateHistoryKey);
      const storedIndex = stored.findIndex(item => item.id === itemId);
      if (storedIndex >= 0) {
        await writeStoredHistory(
          updateHistoryKey,
          stored.map(item =>
            item.id === itemId ? {...item, readState: 'read'} : item,
          ),
        );
      } else {
        const legacy = await readLegacyState(readStateKey);
        const seenIds = new Set(legacy.state.seenIds);
        if (!seenIds.has(itemId)) {
          throw new Error(`Update item not found: ${itemId}`);
        }
        const readIds = new Set(legacy.state.readIds);
        readIds.add(itemId);
        await writeLegacyState(readStateKey, {
          schemaVersion: 1,
          seenIds: [...seenIds],
          readIds: [...readIds],
        });
      }
      await load(false);
    },
  };
};

// Keep the legacy/local entry points dependency-light. The product runtime
// opts into cross-device sync through nativeOfflineAlertRepositories instead.
export const createNativeAlertRulesRepository =
  createNativeAlertRulesLocalReplica;
export const createNativeUpdateCenterRepository =
  createNativeUpdateCenterLocalReplica;
