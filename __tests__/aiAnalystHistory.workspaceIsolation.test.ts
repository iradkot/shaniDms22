import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadAiAnalystHistory,
  upsertAiAnalystConversationSnapshot,
} from 'app/services/aiAnalyst/aiAnalystHistory';
import {
  deriveWorkspaceIdentity,
  sha1WorkspaceIdentityDigest,
} from 'app/modules/workspaces';

const scopeFor = (nightscoutBaseUrl: string) => {
  const identity = deriveWorkspaceIdentity(
    {firebaseUserId: 'product-user-1', nightscoutBaseUrl},
    sha1WorkspaceIdentityDigest,
  );
  if (!identity.ok) {
    throw new Error(identity.reason);
  }
  return {
    productUserId: identity.value.scope.productUserId,
    workspaceId: identity.value.scope.workspaceId,
  };
};

describe('AI Analyst history Workspace isolation', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('cannot read or continue a conversation saved in another Workspace', async () => {
    const firstWorkspace = scopeFor('https://first.example.com');
    const secondWorkspace = scopeFor('https://second.example.com');

    await upsertAiAnalystConversationSnapshot(firstWorkspace, {
      id: 'conversation-1',
      mission: 'openChat',
      messages: [{role: 'user', content: 'Private first Workspace context'}],
    });

    expect(await loadAiAnalystHistory(secondWorkspace)).toEqual([]);
    expect(await loadAiAnalystHistory(firstWorkspace)).toEqual([
      expect.objectContaining({
        id: 'conversation-1',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: 'Private first Workspace context',
          }),
        ],
      }),
    ]);
  });

  it('discards legacy history that cannot be attributed to a Workspace', async () => {
    const activeWorkspace = scopeFor('https://first.example.com');
    await AsyncStorage.setItem(
      'aiAnalyst.history.v1',
      JSON.stringify([
        {
          id: 'legacy-conversation',
          createdAt: 1,
          updatedAt: 1,
          title: 'Legacy private context',
          messages: [{role: 'user', content: 'Do not migrate me', ts: 1}],
        },
      ]),
    );

    expect(await loadAiAnalystHistory(activeWorkspace)).toEqual([]);
    expect(await AsyncStorage.getItem('aiAnalyst.history.v1')).toBeNull();
  });
});
