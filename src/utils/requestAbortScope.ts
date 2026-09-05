export type RequestAbortKind = 'cancelled' | 'timeout';

export class RequestAbortError extends Error {
  constructor(readonly kind: RequestAbortKind) {
    super(
      kind === 'cancelled'
        ? 'The request was cancelled.'
        : 'The request timed out.',
    );
    this.name = kind === 'cancelled' ? 'AbortError' : 'TimeoutError';
  }
}

export interface RequestAbortScope {
  readonly signal: AbortSignal;
  readonly kind: RequestAbortKind | undefined;
  throwIfAborted(): void;
  dispose(): void;
}

/**
 * Owns one composed request signal for the full fetch and body-consumption
 * lifetime. The first abort source wins and cleanup is idempotent.
 */
export const createRequestAbortScope = (input: {
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
}): RequestAbortScope => {
  const controller = new AbortController();
  let kind: RequestAbortKind | undefined;
  let disposed = false;
  let listenerAdded = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const abort = (nextKind: RequestAbortKind): void => {
    if (disposed || kind !== undefined) {
      return;
    }
    kind = nextKind;
    controller.abort();
  };
  const relayAbort = (): void => abort('cancelled');

  if (input.signal?.aborted) {
    abort('cancelled');
  } else {
    input.signal?.addEventListener('abort', relayAbort, {once: true});
    listenerAdded = input.signal !== undefined;
    timeout = setTimeout(() => abort('timeout'), input.timeoutMs);
  }

  return {
    signal: controller.signal,
    get kind() {
      return kind;
    },
    throwIfAborted() {
      if (kind !== undefined) {
        throw new RequestAbortError(kind);
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      if (listenerAdded) {
        input.signal?.removeEventListener('abort', relayAbort);
        listenerAdded = false;
      }
    },
  };
};
