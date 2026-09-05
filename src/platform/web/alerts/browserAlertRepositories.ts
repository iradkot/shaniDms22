import {
  ALERT_RULE_TRENDS,
  type AlertRuleLocalReplica,
  type NewUpdateCenterItem,
  parseImmutableUpdateRecord,
  updateRecordToItem,
  validateAlertRuleInput,
  type AlertRule,
  type AlertRulesSnapshot,
  type UpdateCenterItem,
  type UpdateCenterLocalReplica,
  type UpdateCenterSnapshot,
} from '../../../modules/alerts';
import type {IndexedDbKeyValueStore} from '../storage';
import {createOpaqueBrowserId} from '../identity';
import {sha1} from 'js-sha1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safeScope = (value: string): string => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error('Alert repository scope is invalid.');
  }
  return value;
};

const decodeRule = (value: unknown): AlertRule | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(value.id) ||
    typeof value.name !== 'string' ||
    typeof value.enabled !== 'boolean' ||
    typeof value.lowerBoundMgDl !== 'number' ||
    typeof value.upperBoundMgDl !== 'number' ||
    typeof value.activeFromMinute !== 'number' ||
    typeof value.activeToMinute !== 'number' ||
    typeof value.trend !== 'string' ||
    !(ALERT_RULE_TRENDS as readonly string[]).includes(value.trend) ||
    !Array.isArray(value.triggeredAtMs) ||
    value.triggeredAtMs.length > 2_000 ||
    value.triggeredAtMs.some(
      timestamp =>
        !Number.isSafeInteger(timestamp) || (timestamp as number) <= 0,
    )
  ) {
    return null;
  }
  const validated = validateAlertRuleInput({
    name: value.name,
    enabled: value.enabled,
    lowerBoundMgDl: value.lowerBoundMgDl,
    upperBoundMgDl: value.upperBoundMgDl,
    activeFromMinute: value.activeFromMinute,
    activeToMinute: value.activeToMinute,
    trend: value.trend as AlertRule['trend'],
  });
  return validated.ok
    ? {
        ...validated.value,
        id: value.id,
        triggeredAtMs: value.triggeredAtMs as number[],
      }
    : null;
};

const decodeRules = (raw: string | null): readonly AlertRule[] => {
  if (raw === null) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.rules)
    ) {
      return [];
    }
    return value.rules
      .slice(0, 100)
      .map(decodeRule)
      .filter((rule): rule is AlertRule => rule !== null);
  } catch {
    return [];
  }
};

export const createBrowserAlertRulesLocalReplica = (input: {
  readonly storage: Pick<IndexedDbKeyValueStore, 'getItem' | 'setItem'>;
  readonly scopeId: string;
  readonly createId?: () => string;
}): AlertRuleLocalReplica => {
  const key = `shani.web.alert-rules.v1:${safeScope(input.scopeId)}`;
  const createId = input.createId ?? (() => `rule-${createOpaqueBrowserId()}`);
  let snapshot: AlertRulesSnapshot = {status: 'loading'};
  let operationTail = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: AlertRulesSnapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const write = async (rules: readonly AlertRule[]) => {
    await input.storage.setItem(
      key,
      JSON.stringify({schemaVersion: 1, rules: rules.slice(0, 100)}),
    );
    publish({status: 'ready', rules});
  };
  const ensureReady = async (): Promise<readonly AlertRule[]> => {
    if (snapshot.status !== 'ready') {
      const rules = decodeRules(await input.storage.getItem(key));
      publish({status: 'ready', rules});
    }
    if (snapshot.status !== 'ready') {
      throw new Error('Alert rules are unavailable.');
    }
    return snapshot.rules;
  };
  const mutate = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationTail.catch(() => undefined).then(operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    replaceFromSync: async rules => write(rules),
    refresh: async () => {
      publish({status: 'loading'});
      await ensureReady();
    },
    add: value =>
      mutate(async () => {
        const validated = validateAlertRuleInput(value);
        if (!validated.ok) {
          throw new Error('Alert rule is invalid.');
        }
        const id = createId();
        if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
          throw new Error('Alert rule ID is invalid.');
        }
        const created: AlertRule = {...validated.value, id, triggeredAtMs: []};
        await write([created, ...(await ensureReady())]);
        return created;
      }),
    update: (ruleId, value) =>
      mutate(async () => {
        const validated = validateAlertRuleInput(value);
        if (!validated.ok) {
          throw new Error('Alert rule is invalid.');
        }
        let found = false;
        const rules = (await ensureReady()).map(rule => {
          if (rule.id !== ruleId) {
            return rule;
          }
          found = true;
          return {...rule, ...validated.value};
        });
        if (!found) {
          throw new Error('Alert rule was not found.');
        }
        await write(rules);
      }),
    setEnabled: (ruleId, enabled) =>
      mutate(async () => {
        let found = false;
        const rules = (await ensureReady()).map(rule => {
          if (rule.id !== ruleId) {
            return rule;
          }
          found = true;
          return {...rule, enabled};
        });
        if (!found) {
          throw new Error('Alert rule was not found.');
        }
        await write(rules);
      }),
    delete: ruleId =>
      mutate(async () => {
        const current = await ensureReady();
        if (!current.some(rule => rule.id === ruleId)) {
          throw new Error('Alert rule was not found.');
        }
        await write(current.filter(rule => rule.id !== ruleId));
      }),
  };
};

const LOCAL_DECODE_SCOPE = {
  ownerProductUserId: 'local_owner',
  workspaceId: 'local_workspace',
} as const;

const decodeUpdates = (raw: string | null): readonly UpdateCenterItem[] => {
  if (raw === null) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.items)
    ) {
      return [];
    }
    return value.items
      .flatMap(item => {
        if (
          !isRecord(item) ||
          (item.readState !== 'read' && item.readState !== 'unread')
        ) {
          return [];
        }
        try {
          const record = parseImmutableUpdateRecord(
            {
              schemaVersion: 1,
              documentKind: 'update_center_record',
              ...LOCAL_DECODE_SCOPE,
              recordId: item.id,
              kind: item.kind,
              occurredAtMs: item.occurredAtMs,
              content: item.content,
              ...(item.deepLink === undefined
                ? {}
                : {deepLink: item.deepLink}),
            },
            LOCAL_DECODE_SCOPE,
          );
          return [updateRecordToItem(record, item.readState === 'read')];
        } catch {
          return [];
        }
      })
      .slice(0, 250);
  } catch {
    return [];
  }
};

export const createBrowserUpdateCenterLocalReplica = (input: {
  readonly storage: Pick<IndexedDbKeyValueStore, 'getItem' | 'setItem'>;
  readonly scopeId: string;
  readonly createId?: () => string;
}): UpdateCenterLocalReplica => {
  const key = `shani.web.update-center.v1:${safeScope(input.scopeId)}`;
  const createId = input.createId ?? (() => `update-${createOpaqueBrowserId()}`);
  let snapshot: UpdateCenterSnapshot = {status: 'loading'};
  const listeners = new Set<() => void>();
  const publish = (next: UpdateCenterSnapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const load = async () => {
    const items = decodeUpdates(await input.storage.getItem(key));
    publish({status: 'ready', items});
  };
  const write = async (items: readonly UpdateCenterItem[]) => {
    const normalized = [...items]
      .sort((left, right) => right.occurredAtMs - left.occurredAtMs)
      .slice(0, 250);
    await input.storage.setItem(
      key,
      JSON.stringify({schemaVersion: 1, items: normalized}),
    );
    publish({status: 'ready', items: normalized});
  };
  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    refresh: load,
    replaceFromSync: write,
    append: async (value: NewUpdateCenterItem) => {
      if (snapshot.status !== 'ready') {
        await load();
      }
      if (snapshot.status !== 'ready') {
        throw new Error('Updates are unavailable.');
      }
      if (
        value.idempotencyKey !== undefined &&
        !/^[A-Za-z0-9._:-]{1,240}$/.test(value.idempotencyKey)
      ) {
        throw new Error('Update idempotency key is invalid.');
      }
      const {idempotencyKey, ...contentValue} = value;
      const id =
        idempotencyKey === undefined
          ? createId()
          : `update-${sha1(`${safeScope(input.scopeId)}\u0000${idempotencyKey}`)}`;
      const existing = snapshot.items.find(item => item.id === id);
      if (existing !== undefined) {
        return existing;
      }
      const candidate: UpdateCenterItem = {
        ...contentValue,
        id,
        readState: 'unread',
        ...(contentValue.content.kind === 'alert-rule-occurrence'
          ? {deepLink: {kind: 'alert-occurrence' as const, occurrenceId: id}}
          : {}),
      };
      const validated = updateRecordToItem(
        parseImmutableUpdateRecord(
          {
            schemaVersion: 1,
            documentKind: 'update_center_record',
            ...LOCAL_DECODE_SCOPE,
            recordId: candidate.id,
            kind: candidate.kind,
            occurredAtMs: candidate.occurredAtMs,
            content: candidate.content,
            ...(candidate.deepLink === undefined
              ? {}
              : {deepLink: candidate.deepLink}),
          },
          LOCAL_DECODE_SCOPE,
        ),
        false,
      );
      if (snapshot.items.some(item => item.id === validated.id)) {
        throw new Error('Update ID already exists.');
      }
      await write([validated, ...snapshot.items]);
      return validated;
    },
    markRead: async itemId => {
      if (snapshot.status !== 'ready') {
        await load();
      }
      if (snapshot.status !== 'ready') {
        throw new Error('Updates are unavailable.');
      }
      let found = false;
      const items = snapshot.items.map(item => {
        if (item.id !== itemId) {
          return item;
        }
        found = true;
        return {...item, readState: 'read' as const};
      });
      if (!found) {
        throw new Error('Update was not found.');
      }
      await write(items);
    },
  };
};

// Backward-compatible factories add sync when the caller supplies it.
export {
  createBrowserAlertRulesRepository,
  createBrowserUpdateCenterRepository,
} from './browserOfflineAlertRepositories';
