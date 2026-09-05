import type {AlertRule, AlertRuleInput} from '../domain/alertRules';

export type AlertRulesSnapshot =
  | {readonly status: 'loading'}
  | {readonly status: 'ready'; readonly rules: readonly AlertRule[]}
  | {readonly status: 'error'};

/** Complete App-Owned rule management, independent of its storage adapter. */
export interface AlertRulesRepository {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => AlertRulesSnapshot;
  readonly refresh: () => Promise<void>;
  readonly add: (input: AlertRuleInput) => Promise<AlertRule>;
  readonly update: (ruleId: string, input: AlertRuleInput) => Promise<void>;
  readonly setEnabled: (ruleId: string, enabled: boolean) => Promise<void>;
  readonly delete: (ruleId: string) => Promise<void>;
}
