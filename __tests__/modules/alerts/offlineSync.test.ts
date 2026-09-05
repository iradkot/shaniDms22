import type {
  AlertRule,
  AlertRuleInput,
  AlertRuleLocalReplica,
  AlertRulesSnapshot,
  NewUpdateCenterItem,
  UpdateCenterItem,
  UpdateCenterLocalReplica,
  UpdateCenterSnapshot,
} from '../../../src/modules/alerts';
import {
  InMemoryAlertSyncRemoteAdapter,
  KeyValueAlertRuleSyncStore,
  KeyValueUpdateCenterSyncStore,
  OfflineFirstAlertRulesRepository,
  OfflineFirstUpdateCenterRepository,
  canonicalAlertSyncValue,
} from '../../../src/modules/alerts';

class MemoryStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

class RuleReplica implements AlertRuleLocalReplica {
  private rules: readonly AlertRule[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly createId: () => string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): AlertRulesSnapshot => ({status: 'ready', rules: this.rules});
  refresh = async () => undefined;
  replaceFromSync = async (rules: readonly AlertRule[]) => this.publish(rules);

  async add(input: AlertRuleInput): Promise<AlertRule> {
    const rule = {...input, id: this.createId(), triggeredAtMs: []};
    this.publish([rule, ...this.rules]);
    return rule;
  }
  async update(ruleId: string, input: AlertRuleInput): Promise<void> {
    this.replace(ruleId, rule => ({...rule, ...input}));
  }
  async setEnabled(ruleId: string, enabled: boolean): Promise<void> {
    this.replace(ruleId, rule => ({...rule, enabled}));
  }
  async delete(ruleId: string): Promise<void> {
    if (!this.rules.some(rule => rule.id === ruleId)) {
      throw new Error('missing rule');
    }
    this.publish(this.rules.filter(rule => rule.id !== ruleId));
  }

  private replace(ruleId: string, change: (rule: AlertRule) => AlertRule) {
    if (!this.rules.some(rule => rule.id === ruleId)) {
      throw new Error('missing rule');
    }
    this.publish(
      this.rules.map(rule => (rule.id === ruleId ? change(rule) : rule)),
    );
  }
  private publish(rules: readonly AlertRule[]) {
    this.rules = rules.map(rule => ({...rule, triggeredAtMs: [...rule.triggeredAtMs]}));
    this.listeners.forEach(listener => listener());
  }
}

class UpdateReplica implements UpdateCenterLocalReplica {
  private items: readonly UpdateCenterItem[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly createId: () => string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): UpdateCenterSnapshot => ({status: 'ready', items: this.items});
  refresh = async () => undefined;
  replaceFromSync = async (items: readonly UpdateCenterItem[]) => this.publish(items);

  async append(input: NewUpdateCenterItem): Promise<UpdateCenterItem> {
    const id = this.createId();
    const item: UpdateCenterItem = {
      ...input,
      id,
      readState: 'unread',
      ...(input.content.kind === 'alert-rule-occurrence'
        ? {deepLink: {kind: 'alert-occurrence', occurrenceId: id}}
        : {}),
    };
    this.publish([item, ...this.items]);
    return item;
  }
  async markRead(itemId: string): Promise<void> {
    if (!this.items.some(item => item.id === itemId)) {
      throw new Error('missing update');
    }
    this.publish(
      this.items.map(item =>
        item.id === itemId ? {...item, readState: 'read'} : item,
      ),
    );
  }
  private publish(items: readonly UpdateCenterItem[]) {
    this.items = items.map(item => ({...item}));
    this.listeners.forEach(listener => listener());
  }
}

const scope = {
  ownerProductUserId: 'owner_1',
  workspaceId: 'workspace_1',
} as const;

const ruleInput = (name: string): AlertRuleInput => ({
  name,
  enabled: true,
  lowerBoundMgDl: 70,
  upperBoundMgDl: 180,
  activeFromMinute: 0,
  activeToMinute: 1439,
  trend: 'any',
});

const ruleRepository = (input: {
  storage: MemoryStorage;
  local: RuleReplica;
  remote: InMemoryAlertSyncRemoteAdapter;
  mutationId: string;
  now?: number;
}) =>
  new OfflineFirstAlertRulesRepository({
    local: input.local,
    store: new KeyValueAlertRuleSyncStore(input.storage, scope),
    scope,
    clock: {now: () => input.now ?? 1_000},
    ids: {next: () => input.mutationId},
    remote: input.remote,
  });

test('rule writes are durable locally without awaiting the remote', async () => {
  const storage = new MemoryStorage();
  let release: (() => void) | undefined;
  const blocked = new Promise<void>(resolve => {
    release = resolve;
  });
  const remote = new InMemoryAlertSyncRemoteAdapter();
  const original = remote.commitRule.bind(remote);
  remote.commitRule = async (...args) => {
    await blocked;
    return original(...args);
  };
  const repository = ruleRepository({
    storage,
    local: new RuleReplica(() => 'rule_1'),
    remote,
    mutationId: 'mutation_1',
  });

  await repository.add(ruleInput('Offline first'));
  expect(repository.getSnapshot()).toMatchObject({
    status: 'ready',
    rules: [{id: 'rule_1', name: 'Offline first'}],
  });
  expect(
    (await new KeyValueAlertRuleSyncStore(storage, scope).read()).outbox,
  ).toHaveLength(1);
  release?.();
  await repository.synchronize();
});

test('durable rule outbox retries after a new repository instance opens', async () => {
  const storage = new MemoryStorage();
  const remote = new InMemoryAlertSyncRemoteAdapter();
  const original = remote.commitRule.bind(remote);
  let offline = true;
  remote.commitRule = async (...args) => {
    if (offline) {
      throw new Error('offline');
    }
    return original(...args);
  };
  const local = new RuleReplica(() => 'rule_1');
  const first = ruleRepository({
    storage,
    local,
    remote,
    mutationId: 'mutation_1',
  });
  await first.add(ruleInput('Retry me'));
  await first.synchronize();
  expect((await new KeyValueAlertRuleSyncStore(storage, scope).read()).outbox).toHaveLength(1);

  offline = false;
  const reopened = ruleRepository({
    storage,
    local,
    remote,
    mutationId: 'mutation_2',
  });
  await reopened.synchronize();
  expect((await new KeyValueAlertRuleSyncStore(storage, scope).read()).outbox).toHaveLength(0);
  expect(await remote.listRules(scope)).toMatchObject([
    {ruleId: 'rule_1', revision: 1, value: {name: 'Retry me'}},
  ]);
});

test('concurrent rule edits deterministically converge by mutation ID', async () => {
  const remote = new InMemoryAlertSyncRemoteAdapter();
  let offline = true;
  const original = remote.commitRule.bind(remote);
  remote.commitRule = async (...args) => {
    if (offline) {
      throw new Error('offline');
    }
    return original(...args);
  };
  const alpha = ruleRepository({
    storage: new MemoryStorage(),
    local: new RuleReplica(() => 'rule_shared'),
    remote,
    mutationId: 'mutation_a',
  });
  const omega = ruleRepository({
    storage: new MemoryStorage(),
    local: new RuleReplica(() => 'rule_shared'),
    remote,
    mutationId: 'mutation_z',
  });
  await Promise.all([
    alpha.add(ruleInput('Alpha edit')),
    omega.add(ruleInput('Omega edit')),
  ]);
  offline = false;
  await alpha.synchronize();
  await omega.synchronize();
  await alpha.synchronize();

  expect(await remote.listRules(scope)).toMatchObject([
    {revision: 2, mutationId: 'mutation_z', value: {name: 'Omega edit'}},
  ]);
  expect(alpha.getSnapshot()).toMatchObject({
    rules: [{name: 'Omega edit'}],
  });
});

test('immutable updates sync separately from read state across devices', async () => {
  const remote = new InMemoryAlertSyncRemoteAdapter();
  const storageA = new MemoryStorage();
  const storageB = new MemoryStorage();
  let now = 2_000;
  const first = new OfflineFirstUpdateCenterRepository({
    local: new UpdateReplica(() => 'reminder_1'),
    store: new KeyValueUpdateCenterSyncStore(storageA, scope),
    scope,
    clock: {now: () => now},
    remote,
  });
  const second = new OfflineFirstUpdateCenterRepository({
    local: new UpdateReplica(() => 'unused'),
    store: new KeyValueUpdateCenterSyncStore(storageB, scope),
    scope,
    clock: {now: () => now},
    remote,
  });

  const item = await first.append({
    kind: 'reminder',
    occurredAtMs: 1_000,
    content: {kind: 'message', title: 'Review yesterday'},
  });
  await first.synchronize();
  const immutableBefore = canonicalAlertSyncValue(
    (await remote.listUpdates(scope))[0],
  );

  await second.refresh();
  expect(second.getSnapshot()).toMatchObject({
    items: [{id: item.id, readState: 'unread'}],
  });
  now = 3_000;
  await second.markRead(item.id);
  await second.synchronize();
  await first.refresh();

  expect(first.getSnapshot()).toMatchObject({
    items: [{id: item.id, readState: 'read'}],
  });
  expect(
    canonicalAlertSyncValue((await remote.listUpdates(scope))[0]),
  ).toBe(immutableBefore);
  expect(await remote.listReadState(scope)).toMatchObject([
    {itemId: item.id, readAtMs: 3_000},
  ]);
});

test('remote collections remain owner and Workspace scoped', async () => {
  const remote = new InMemoryAlertSyncRemoteAdapter();
  const repository = ruleRepository({
    storage: new MemoryStorage(),
    local: new RuleReplica(() => 'rule_1'),
    remote,
    mutationId: 'mutation_1',
  });
  await repository.add(ruleInput('Scoped'));
  await repository.synchronize();

  expect(
    await remote.listRules({...scope, workspaceId: 'workspace_2'}),
  ).toEqual([]);
  expect(
    await remote.listRules({...scope, ownerProductUserId: 'owner_2'}),
  ).toEqual([]);
});
