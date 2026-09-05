import {createBrowserAlertsFirestoreGateway} from '../../../src/platform/web/alerts/browserAlertsFirestoreGateway';
import type {AlertFirestoreGateway} from '../../../src/modules/alerts';

const jsonResponse = (status: number, value: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response);

const transactionGateway: Pick<
  AlertFirestoreGateway,
  'get' | 'runTransaction'
> = {
  get: async () => ({exists: false}),
  runTransaction: async operation =>
    operation({
      get: async () => ({exists: false}),
      set: () => undefined,
    }),
};

describe('browser Alert Firestore gateway', () => {
  it('lists and decodes a scoped collection path', async () => {
    const request = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        documents: [
          {
            name: 'projects/shani-project-123/databases/(default)/documents/users/owner-1/workspaces/workspace-1/alertRules/rule-1',
            fields: {
              enabled: {booleanValue: true},
              revision: {integerValue: '2'},
              value: {
                mapValue: {
                  fields: {trend: {stringValue: 'single-down'}},
                },
              },
            },
          },
        ],
      }),
    );
    const gateway = createBrowserAlertsFirestoreGateway({
      projectId: 'shani-project-123',
      auth: {getIdToken: async () => 'firebase-token'},
      transactions: transactionGateway,
      fetch: request,
    });

    await expect(
      gateway.list(
        'users/owner-1/workspaces/workspace-1/alertRules',
      ),
    ).resolves.toEqual([
      {
        id: 'rule-1',
        data: {
          enabled: true,
          revision: 2,
          value: {trend: 'single-down'},
        },
      },
    ]);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining(
        '/documents/users/owner-1/workspaces/workspace-1/alertRules?pageSize=250',
      ),
      {headers: {Authorization: 'Bearer firebase-token'}},
    );
  });

  it('rejects document paths and unsafe collection segments', async () => {
    const gateway = createBrowserAlertsFirestoreGateway({
      projectId: 'shani-project-123',
      auth: {getIdToken: async () => 'firebase-token'},
      transactions: transactionGateway,
      fetch: jest.fn(),
    });

    await expect(
      gateway.list('users/owner-1/workspaces/workspace-1'),
    ).rejects.toThrow('collection path');
    await expect(
      gateway.list('users/owner-1/workspaces/../alertRules'),
    ).rejects.toThrow('collection path');
  });
});
