import {createFirestoreRestGateway} from '../../../src/platform/web';
import {
  PRIVACY_POLICY_VERSION,
  registerPrivacySession,
} from '../../../src/modules/privacy';

const jsonResponse = (status: number, value: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response);

describe('Firestore REST gateway', () => {
  beforeEach(() => {
    registerPrivacySession('user_1', {
      policyVersion: PRIVACY_POLICY_VERSION,
      cloudSync: true,
      aiProcessing: true,
      updatedAtMs: 1,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('performs atomic reads and writes with a server timestamp transform', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, {transaction: 'transaction-id'}))
      .mockResolvedValueOnce(jsonResponse(404, {error: {status: 'NOT_FOUND'}}))
      .mockResolvedValueOnce(jsonResponse(200, {writeResults: []}));
    const gateway = createFirestoreRestGateway({
      projectId: 'shani-project-123',
      auth: {getIdToken: async () => 'firebase-id-token-1234567890'},
      fetch: request,
    });

    await expect(
      gateway.runTransaction(async transaction => {
        await expect(
          transaction.get('users/user_1/items/item_1'),
        ).resolves.toEqual({
          exists: false,
        });
        transaction.set('users/user_1/items/item_1', {
          schemaVersion: 1,
          committedAt: transaction.serverTimestamp(),
          nested: {label: 'value'},
          note: 'See /users/other for an example in this note.',
        });
        return 'committed';
      }),
    ).resolves.toBe('committed');

    const commitBody = JSON.parse(
      String(request.mock.calls[2]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(JSON.stringify(commitBody)).toContain('REQUEST_TIME');
    expect(JSON.stringify(commitBody)).toContain('transaction-id');
    expect(JSON.stringify(commitBody)).not.toContain('firebase-id-token');
  });

  it('denies actual cross-owner writes before sending a commit', async () => {
    const request = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {transaction: 'transaction-id'}));
    const gateway = createFirestoreRestGateway({
      projectId: 'shani-project-123',
      auth: {getIdToken: async () => 'firebase-id-token-1234567890'},
      fetch: request,
    });
    await expect(
      gateway.runTransaction(async transaction => {
        transaction.set('users/other/items/item_1', {note: 'owner-only data'});
      }),
    ).rejects.toMatchObject({code: 'privacy_consent_required'});
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toContain(':beginTransaction');
  });

  it('denies a stale transaction after the same owner starts a new privacy session', async () => {
    const request = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {transaction: 'transaction-id'}));
    const gateway = createFirestoreRestGateway({
      projectId: 'shani-project-123',
      auth: {getIdToken: async () => 'firebase-id-token-1234567890'},
      fetch: request,
    });
    await expect(
      gateway.runTransaction(async transaction => {
        registerPrivacySession('user_1', {
          policyVersion: PRIVACY_POLICY_VERSION,
          cloudSync: true,
          aiProcessing: true,
          updatedAtMs: 2,
        });
        transaction.set('users/user_1/items/item_1', {note: 'stale'});
      }),
    ).rejects.toMatchObject({code: 'privacy_consent_required'});
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps the deadline active while a response body is read', async () => {
    jest.useFakeTimers();
    let resolveBody!: (value: unknown) => void;
    const body = new Promise<unknown>(resolve => {
      resolveBody = resolve;
    });
    const json = jest.fn(() => body);
    const request = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json,
    } as unknown as Response);
    const gateway = createFirestoreRestGateway({
      projectId: 'shani-project-123',
      auth: {getIdToken: async () => 'firebase-id-token-1234567890'},
      fetch: request,
      timeoutMs: 10,
    });

    const pending = gateway.get('users/user_1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(json).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(10);
    resolveBody({fields: {label: {stringValue: 'late'}}});

    await expect(pending).rejects.toMatchObject({code: 'deadline-exceeded'});
    expect(jest.getTimerCount()).toBe(0);
  });
});
