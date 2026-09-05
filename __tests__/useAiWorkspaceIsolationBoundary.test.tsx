import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import type {AiWorkspaceScope} from 'app/services/aiMemory/aiWorkspaceScope';
import {useAiWorkspaceIsolationBoundary} from 'app/services/aiAnalyst/useAiWorkspaceIsolationBoundary';
import {parseProductUserId, parseWorkspaceId} from 'app/modules/journal';

const valueOf = <T,>(result: {ok: true; value: T} | {ok: false}): T => {
  if (!result.ok) {
    throw new Error('invalid test identifier');
  }
  return result.value;
};

const scope = (workspaceId: string): AiWorkspaceScope => ({
  productUserId: valueOf(parseProductUserId('product-user-1')),
  workspaceId: valueOf(parseWorkspaceId(workspaceId)),
});

const Harness = ({
  activeScope,
  abortActive,
  resetSession,
}: {
  activeScope: AiWorkspaceScope | null;
  abortActive: () => void;
  resetSession: () => void;
}) => {
  useAiWorkspaceIsolationBoundary({
    scope: activeScope,
    abortActive,
    resetSession,
  });
  return null;
};

describe('useAiWorkspaceIsolationBoundary', () => {
  it('aborts and resets active AI work when the Workspace changes', async () => {
    const abortActive = jest.fn();
    const resetSession = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <Harness
          activeScope={scope('workspace-1')}
          abortActive={abortActive}
          resetSession={resetSession}
        />,
      );
    });
    expect(abortActive).not.toHaveBeenCalled();
    expect(resetSession).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(
        <Harness
          activeScope={scope('workspace-2')}
          abortActive={abortActive}
          resetSession={resetSession}
        />,
      );
    });

    expect(abortActive).toHaveBeenCalledTimes(1);
    expect(resetSession).toHaveBeenCalledTimes(1);
  });
});
