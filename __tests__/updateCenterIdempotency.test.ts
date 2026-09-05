import AsyncStorage from '@react-native-async-storage/async-storage';
import {createNativeUpdateCenterLocalReplica} from 'app/platform/native/alerts/localNotificationRepositories';
import {createBrowserUpdateCenterLocalReplica} from 'app/platform/web/alerts/browserAlertRepositories';

const value = {
  idempotencyKey: 'daily-brief:1700000000000',
  kind: 'generated-update' as const,
  occurredAtMs: 1_700_000_000_000,
  content: {kind: 'message' as const, title: 'Daily brief', body: 'Facts'},
};

describe('Update Center producer idempotency', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('returns one native item when an offline producer retries', async () => {
    const repository = createNativeUpdateCenterLocalReplica({
      scopeId: 'workspace_a',
    });
    const first = await repository.append(value);
    const second = await repository.append(value);
    expect(second.id).toBe(first.id);
    expect(repository.getSnapshot()).toMatchObject({
      status: 'ready',
      items: [{id: first.id}],
    });
  });

  it('returns one browser item when an offline producer retries', async () => {
    const values = new Map<string, string>();
    const repository = createBrowserUpdateCenterLocalReplica({
      scopeId: 'workspace_a',
      storage: {
        getItem: async key => values.get(key) ?? null,
        setItem: async (key, encoded) => {
          values.set(key, encoded);
        },
      },
    });
    const first = await repository.append(value);
    const second = await repository.append(value);
    expect(second.id).toBe(first.id);
    expect(repository.getSnapshot()).toMatchObject({
      status: 'ready',
      items: [{id: first.id}],
    });
  });
});
