import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadAiHomeRecommendation,
  saveAiHomeRecommendation,
} from 'app/services/aiMemory/aiHomeRecommendationStore';
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

describe('AI Home recommendation Workspace isolation', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('does not show a saved Today recommendation in another Workspace', async () => {
    const firstWorkspace = scopeFor('https://first.example.com');
    const secondWorkspace = scopeFor('https://second.example.com');

    await saveAiHomeRecommendation(firstWorkspace, {
      date: '2026-08-30',
      text: 'Private recommendation for the first Workspace',
      generatedAt: 1_777_777,
    });

    expect(await loadAiHomeRecommendation(secondWorkspace)).toBeNull();
    expect(await loadAiHomeRecommendation(firstWorkspace)).toEqual({
      date: '2026-08-30',
      text: 'Private recommendation for the first Workspace',
      generatedAt: 1_777_777,
    });
  });
});
