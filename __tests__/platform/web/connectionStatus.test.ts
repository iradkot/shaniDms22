import {resolveConnections} from '../../../web/connectionStatus';
import type {
  AuthenticatedWebApiClient,
  IndexedDbKeyValueStore,
} from '../../../src/platform/web';

describe('browser connection status refresh', () => {
  it('keeps the successful AI status when Nightscout is unavailable', async () => {
    const requestJson = jest.fn(async (path: string) => {
      if (path.includes('nightscout')) {
        throw new Error('Unavailable');
      }
      return {version: 1, configured: true};
    });
    const storage = {
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn().mockResolvedValue(undefined),
    };
    const marker = await resolveConnections({
      uid: 'test-user',
      api: {requestJson} as unknown as AuthenticatedWebApiClient,
      storage: storage as unknown as IndexedDbKeyValueStore,
    });
    expect(marker.aiConfigured).toBe(true);
    expect(marker.nightscout.configured).toBe(false);
  });

  it('keeps a fresh Nightscout status and cached AI status independently', async () => {
    const requestJson = jest.fn(async (path: string) => {
      if (path.includes('/llm/')) {
        throw new Error('Unavailable');
      }
      return {
        version: 1,
        configured: true,
        sourceId: 'source-new',
        workspaceId: 'workspace-new',
      };
    });
    const storage = {
      getItem: jest.fn().mockResolvedValue(
        JSON.stringify({
          schemaVersion: 1,
          nightscout: {
            configured: true,
            sourceId: 'source-old',
            workspaceId: 'workspace-old',
          },
          aiConfigured: true,
          aiEnabled: false,
        }),
      ),
      setItem: jest.fn().mockResolvedValue(undefined),
    };
    const marker = await resolveConnections({
      uid: 'test-user',
      api: {requestJson} as unknown as AuthenticatedWebApiClient,
      storage: storage as unknown as IndexedDbKeyValueStore,
    });
    expect(marker).toMatchObject({
      nightscout: {sourceId: 'source-new'},
      aiConfigured: true,
      aiEnabled: false,
    });
  });

  it('keeps live status when the local marker cannot be written', async () => {
    const storage = {
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn().mockRejectedValue(new Error('Storage unavailable')),
    };
    const requestJson = jest.fn(async (path: string) =>
      path.includes('nightscout')
        ? {version: 1, configured: false}
        : {version: 1, configured: true},
    );
    const marker = await resolveConnections({
      uid: 'test-user',
      api: {requestJson} as unknown as AuthenticatedWebApiClient,
      storage: storage as unknown as IndexedDbKeyValueStore,
    });
    expect(marker.aiConfigured).toBe(true);
  });
});
