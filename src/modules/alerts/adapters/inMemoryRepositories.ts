import type {
  AlertRulesRepository,
  AlertRulesSnapshot,
  UpdateCenterRepository,
  UpdateCenterSnapshot,
} from '../contracts';
import type {AlertRule, AlertRuleInput} from '../domain/alertRules';
import {validateAlertRuleInput} from '../domain/alertRules';
import type {UpdateCenterItem} from '../domain/updates';

export class AlertRuleValidationError extends Error {
  constructor(readonly issueCodes: readonly string[]) {
    super(`Invalid alert rule: ${issueCodes.join(', ')}`);
    this.name = 'AlertRuleValidationError';
  }
}

const immutableRules = (rules: readonly AlertRule[]): readonly AlertRule[] =>
  Object.freeze(
    rules.map(rule =>
      Object.freeze({
        ...rule,
        triggeredAtMs: Object.freeze([...rule.triggeredAtMs]),
      }),
    ),
  );

const immutableItems = (
  items: readonly UpdateCenterItem[],
): readonly UpdateCenterItem[] =>
  Object.freeze(
    [...items]
      .sort((left, right) => right.occurredAtMs - left.occurredAtMs)
      .map(item => Object.freeze({...item})),
  );

const assertRuleInput = (input: AlertRuleInput): AlertRuleInput => {
  const result = validateAlertRuleInput(input);
  if (!result.ok) {
    throw new AlertRuleValidationError(
      result.issues.map(issue => issue.code),
    );
  }
  return result.value;
};

const defaultCreateId = (): string =>
  `alert-rule-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

export const createInMemoryUpdateCenterRepository = (
  initialItems: readonly UpdateCenterItem[] = [],
): UpdateCenterRepository => {
  let snapshot: UpdateCenterSnapshot = {
    status: 'ready',
    items: immutableItems(initialItems),
  };
  const listeners = new Set<() => void>();
  const publish = (next: UpdateCenterSnapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };

  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    refresh: async () => undefined,
    markRead: async itemId => {
      if (snapshot.status !== 'ready') {
        throw new Error('Update center is not ready.');
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
        throw new Error(`Update item not found: ${itemId}`);
      }
      publish({status: 'ready', items: immutableItems(items)});
    },
  };
};

export interface InMemoryAlertRulesOptions {
  readonly createId?: () => string;
}

export const createInMemoryAlertRulesRepository = (
  initialRules: readonly AlertRule[] = [],
  options: InMemoryAlertRulesOptions = {},
): AlertRulesRepository => {
  let snapshot: AlertRulesSnapshot = {
    status: 'ready',
    rules: immutableRules(initialRules),
  };
  const listeners = new Set<() => void>();
  const createId = options.createId ?? defaultCreateId;
  const publish = (rules: readonly AlertRule[]) => {
    snapshot = {status: 'ready', rules: immutableRules(rules)};
    listeners.forEach(listener => listener());
  };
  const currentRules = (): readonly AlertRule[] => {
    if (snapshot.status !== 'ready') {
      throw new Error('Alert rules are not ready.');
    }
    return snapshot.rules;
  };

  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    refresh: async () => undefined,
    add: async input => {
      const value = assertRuleInput(input);
      const created: AlertRule = {
        ...value,
        id: createId(),
        triggeredAtMs: [],
      };
      publish([created, ...currentRules()]);
      return created;
    },
    update: async (ruleId, input) => {
      const value = assertRuleInput(input);
      let found = false;
      const rules = currentRules().map(rule => {
        if (rule.id !== ruleId) {
          return rule;
        }
        found = true;
        return {...rule, ...value};
      });
      if (!found) {
        throw new Error(`Alert rule not found: ${ruleId}`);
      }
      publish(rules);
    },
    setEnabled: async (ruleId, enabled) => {
      let found = false;
      const rules = currentRules().map(rule => {
        if (rule.id !== ruleId) {
          return rule;
        }
        found = true;
        return {...rule, enabled};
      });
      if (!found) {
        throw new Error(`Alert rule not found: ${ruleId}`);
      }
      publish(rules);
    },
    delete: async ruleId => {
      const rules = currentRules();
      if (!rules.some(rule => rule.id === ruleId)) {
        throw new Error(`Alert rule not found: ${ruleId}`);
      }
      publish(rules.filter(rule => rule.id !== ruleId));
    },
  };
};
