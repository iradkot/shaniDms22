import {useLayoutEffect, useRef} from 'react';

import type {AiWorkspaceScope} from 'app/services/aiMemory/aiWorkspaceScope';

const scopeIdentity = (scope: AiWorkspaceScope | null): string | null =>
  scope === null ? null : `${scope.productUserId}\n${scope.workspaceId}`;

/**
 * Invalidates transient AI state at the same boundary as persisted state.
 * Re-creating an equal scope object does not interrupt the current session.
 */
export const useAiWorkspaceIsolationBoundary = (input: {
  readonly scope: AiWorkspaceScope | null;
  readonly abortActive: () => void;
  readonly resetSession: () => void;
}): void => {
  const {scope, abortActive, resetSession} = input;
  const identity = scopeIdentity(scope);
  const previousIdentity = useRef(identity);

  useLayoutEffect(() => {
    if (previousIdentity.current === identity) {
      return;
    }
    previousIdentity.current = identity;
    abortActive();
    resetSession();
  }, [abortActive, identity, resetSession]);
};
