import {
  accountWorkspaceScopeId,
  belongsToAccount,
  purgeLocalAccountData,
} from '../../../src/modules/privacy/localAccountCleanup';
import {createRecommendationMemoryStore} from '../../../src/services/aiRecommendations/recommendationMemory';
import {aiWorkspaceStorageKey} from '../../../src/services/aiMemory/aiWorkspaceScope';
import {
  createBrowserAlertRulesLocalReplica,
  createBrowserUpdateCenterLocalReplica,
} from '../../../src/platform/web/alerts/browserAlertRepositories';
import {
  AppOwnedUriJournalMediaStore,
  createJournalEngine,
  KeyValueJournalLocalStore,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
  type JournalWorkspaceScope,
} from '../../../src/modules/journal';
import {emptyJournalState} from '../../../src/modules/journal/engine/stateCodec';
import {KeyValueProductPersonalizationStore} from '../../../src/product/personalization/persistence';
import {createDefaultProductPersonalization} from '../../../src/product/personalization/presets';

class MemoryStorage {
  readonly values = new Map<string, string>();
  beforeWrite: ((key: string) => Promise<void>) | undefined;
  async getAllKeys() {return [...this.values.keys()];}
  async getItem(key: string) {return this.values.get(key) ?? null;}
  async setItem(key: string, value: string) {
    await this.beforeWrite?.(key);
    this.values.set(key, value);
  }
  async removeItem(key: string) {this.values.delete(key);}
}

const parsed = <T>(value: {ok: true; value: T} | {ok: false}): T => {
  if (!value.ok) {throw new Error('Invalid fixture identifier.');}
  return value.value;
};
const scopeOf = (uid: string, workspaceId: string): JournalWorkspaceScope => ({
  productUserId: parsed(parseProductUserId(uid)),
  workspaceId: parsed(parseWorkspaceId(workspaceId)),
  nightscoutSourceId: parsed(parseNightscoutSourceId('fixture-source')),
});
const rule = {name: 'Night range', enabled: true, lowerBoundMgDl: 70, upperBoundMgDl: 180,
  activeFromMinute: 0, activeToMinute: 1439, trend: 'any' as const};
const update = {kind: 'reminder' as const, occurredAtMs: 2000,
  content: {kind: 'message' as const, title: 'Recorded reminder'}};

test('purges actual native/browser memory, legacy browser stores and journal images while retaining B and unknown data', async () => {
  const storage = new MemoryStorage();
  const a = scopeOf('purge-owner', 'workspace-A');
  // This workspace deliberately equals A's UID; it never grants ownership of B.
  const b = scopeOf('purge-owner-extra', 'purge-owner');
  let sequence = 0;
  for (const scope of [a, b]) {
    const opened = await createJournalEngine({localStore: new KeyValueJournalLocalStore(storage),
      clock: {now: () => 1700000000000}, ids: {nextEntryId: () => `entry-${++sequence}`, nextOperationId: () => `op-${++sequence}`},
      mediaStore: new AppOwnedUriJournalMediaStore()}).open(scope);
    if (!opened.ok) {throw new Error(opened.error.message);}
    const captured = await opened.value.meals.capture({mealStart: 1700000000000,
      image: {uri: `file:///private/meal-images/image_${scope.productUserId}.jpg`, mimeType: 'image/jpeg'}});
    expect(captured.ok).toBe(true);
    await createRecommendationMemoryStore({storage,
      scopeId: aiWorkspaceStorageKey('recommendations', scope), accountScope: scope})
      .update(current => ({...current, instructions: scope.productUserId}));
    const legacyScope = `${scope.productUserId}-${scope.workspaceId}`;
    await createRecommendationMemoryStore({storage, scopeId: legacyScope})
      .update(current => ({...current, instructions: scope.productUserId}));
    await createBrowserAlertRulesLocalReplica({storage, scopeId: legacyScope, createId: () => `rule-${++sequence}`}).add(rule);
    await createBrowserUpdateCenterLocalReplica({storage, scopeId: legacyScope, createId: () => `update-${++sequence}`}).append(update);
    await storage.setItem(`shani.web.ai-history.v1:${legacyScope}`, JSON.stringify({schemaVersion: 1, items: [{title: scope.productUserId}]}));
    await createBrowserAlertRulesLocalReplica({storage, scopeId: accountWorkspaceScopeId(scope), accountScope: scope,
      createId: () => `rule-${++sequence}`}).add(rule);
  }
  await storage.setItem('unknown-ai-memory', JSON.stringify({ownerScope: 'unattributed-workspace', instructions: 'unknown'}));
  const before = new Map(storage.values);
  const removeImage = jest.fn(async (_uri: string) => {});
  await purgeLocalAccountData(storage, a.productUserId, removeImage);
  expect(removeImage.mock.calls.map(([uri]) => uri)).toEqual([`file:///private/meal-images/image_${a.productUserId}.jpg`]);
  for (const [key, value] of before) {
    if (value.includes(b.productUserId) || key.includes(encodeURIComponent(b.productUserId))) {
      expect(storage.values.get(key)).toBe(value);
    }
  }
  expect(storage.values.has('unknown-ai-memory')).toBe(true);
  expect([...storage.values.values()].some(value => value.includes(`"instructions":"${a.productUserId}"`))).toBe(false);
  expect(storage.values.has(`shani.web.alert-rules.v1:${a.productUserId}-${a.workspaceId}`)).toBe(false);
  expect(storage.values.has(`shani.web.update-center.v1:${a.productUserId}-${a.workspaceId}`)).toBe(false);
  expect(storage.values.has(`shani.web.ai-history.v1:${a.productUserId}-${a.workspaceId}`)).toBe(false);
});

test('retains ambiguous hyphenated legacy scopes and rejects conflicting owner stamps and owner-position collisions', async () => {
  const storage = new MemoryStorage();
  const a = scopeOf('collision-owner', 'x');
  const b = scopeOf('collision', 'owner-x');
  const journals = new KeyValueJournalLocalStore(storage);
  await journals.commit(a, 0, emptyJournalState(a));
  await journals.commit(b, 0, emptyJournalState(b));
  const legacyScope = `${a.productUserId}-${a.workspaceId}`;
  expect(legacyScope).toBe(`${b.productUserId}-${b.workspaceId}`);
  await createRecommendationMemoryStore({storage, scopeId: legacyScope}).update(current => ({...current, instructions: 'ambiguous'}));
  const ambiguousKey = `shani.ai.recommendations.v1:${encodeURIComponent(legacyScope)}`;
  const ambiguous = storage.values.get(ambiguousKey);
  const newStore = createRecommendationMemoryStore({storage, scopeId: accountWorkspaceScopeId(a), accountScope: a, legacyScopeId: legacyScope});
  expect((await newStore.read()).instructions).toBe('');
  expect(belongsToAccount(`journal:v1:${b.productUserId}:${a.productUserId}:source`, null, a.productUserId)).toBe(false);
  expect(belongsToAccount(`journal:v1:${a.productUserId}:w:source`, JSON.stringify({scope: {productUserId: b.productUserId}}), a.productUserId)).toBe(false);
  await purgeLocalAccountData(storage, a.productUserId, async () => {});
  expect(storage.values.get(ambiguousKey)).toBe(ambiguous);
});

test('safely imports a provably owned legacy recommendation scope into the new owner-stamped scope', async () => {
  const storage = new MemoryStorage();
  const accountScope = scopeOf('migration-owner', 'workspace');
  await new KeyValueJournalLocalStore(storage).commit(accountScope, 0, emptyJournalState(accountScope));
  const legacyScopeId = `${accountScope.productUserId}-${accountScope.workspaceId}`;
  await createRecommendationMemoryStore({storage, scopeId: legacyScopeId}).update(current => ({...current, instructions: 'Keep this preference'}));
  const store = createRecommendationMemoryStore({storage, scopeId: accountWorkspaceScopeId(accountScope), accountScope, legacyScopeId});
  expect((await store.read()).instructions).toBe('Keep this preference');
  await store.update(current => ({...current, enabled: false}));
  const key = `shani.ai.recommendations.v1:${encodeURIComponent(accountWorkspaceScopeId(accountScope))}`;
  expect(JSON.parse(storage.values.get(key)!)).toMatchObject({ownerProductUserId: accountScope.productUserId, workspaceId: accountScope.workspaceId});
});

test('shared-array cleanup honors an explicit B owner over a contradictory nested A scope', async () => {
  const storage = new MemoryStorage();
  const a = 'shared-precedence-owner-A';
  const b = 'shared-precedence-owner-B';
  const retained = {ownerProductUserId: b, scope: {productUserId: a},
    localUri: 'file:///private/meal-images/image_retained_B.jpg'};
  const unknown = {label: 'unknown owner'};
  await storage.setItem('shared-legacy-records', JSON.stringify([
    {ownerProductUserId: a, localUri: 'file:///private/meal-images/image_removed_A.jpg'}, retained, unknown,
  ]));
  const removeImage = jest.fn(async (_uri: string) => {});
  await purgeLocalAccountData(storage, a, removeImage);
  expect(JSON.parse(storage.values.get('shared-legacy-records')!)).toEqual([retained, unknown]);
  expect(removeImage).toHaveBeenCalledTimes(1);
  expect(removeImage).toHaveBeenCalledWith('file:///private/meal-images/image_removed_A.jpg');
});

test.each(['memory', 'journal', 'alerts'] as const)('drains an actual delayed %s write and blocks queued or stale writes after deletion', async kind => {
  const storage = new MemoryStorage();
  const accountScope = scopeOf(`race-${kind}-owner`, 'workspace');
  const memory = createRecommendationMemoryStore({storage, scopeId: aiWorkspaceStorageKey('recommendations', accountScope), accountScope});
  const journal = new KeyValueJournalLocalStore(storage);
  const alerts = createBrowserAlertRulesLocalReplica({storage, scopeId: accountWorkspaceScopeId(accountScope), accountScope, createId: () => 'race-rule'});
  const write = () => kind === 'memory' ? memory.update(current => ({...current, instructions: 'Late private preference'}))
    : kind === 'journal' ? journal.commit(accountScope, 0, emptyJournalState(accountScope)) : alerts.add(rule);
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => {started = resolve;});
  const gate = new Promise<void>(resolve => {release = resolve;});
  let first = true;
  storage.beforeWrite = async () => {if (first) {first = false; started(); await gate;}};
  const writing = write();
  const writingOutcome = writing.catch(() => undefined);
  await entered;
  const queued = write().catch(() => undefined);
  let deleted = false;
  const purge = purgeLocalAccountData(storage, accountScope.productUserId, async () => {}).then(() => {deleted = true;});
  await Promise.resolve();
  expect(deleted).toBe(false);
  release();
  await Promise.all([writingOutcome, queued, purge]);
  expect([...storage.values.keys()]).toEqual([]);
  await expect(write()).rejects.toThrow('Account deletion');
});

test('waits for all parallel personalization writes when one sibling fails, then purges without resurrection', async () => {
  const storage = new MemoryStorage();
  const scope = {...scopeOf('race-personalization-owner', 'workspace'), layout: 'phone' as const};
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => {started = resolve;});
  const gate = new Promise<void>(resolve => {release = resolve;});
  storage.beforeWrite = async key => {
    if (key.includes('.account:')) {throw new Error('disk full');}
    if (key.includes('.workspace:')) {started(); await gate;}
  };
  const store = new KeyValueProductPersonalizationStore(storage);
  const writing = store.write(scope, createDefaultProductPersonalization()).catch(() => undefined);
  await entered;
  let deleted = false;
  const purge = purgeLocalAccountData(storage, scope.productUserId, async () => {}).then(() => {deleted = true;});
  await Promise.resolve();
  expect(deleted).toBe(false);
  release();
  await Promise.all([writing, purge]);
  expect([...storage.values.keys()]).toEqual([]);
  await expect(store.write(scope, createDefaultProductPersonalization())).rejects.toThrow('Account deletion');
});
