import {createRequestAbortScope} from 'app/utils/requestAbortScope';

describe('request abort scope', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('recognizes a pre-aborted signal without adding a listener or timer', () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const addListener = jest.spyOn(controller.signal, 'addEventListener');
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');

    const scope = createRequestAbortScope({
      signal: controller.signal,
      timeoutMs: 10,
    });

    expect(scope.kind).toBe('cancelled');
    expect(scope.signal.aborted).toBe(true);
    expect(() => scope.throwIfAborted()).toThrow(
      expect.objectContaining({name: 'AbortError'}),
    );
    expect(addListener).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    scope.dispose();
    expect(removeListener).not.toHaveBeenCalled();
  });

  it('removes its listener and timer exactly once when disposed', () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const addListener = jest.spyOn(controller.signal, 'addEventListener');
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');
    const scope = createRequestAbortScope({
      signal: controller.signal,
      timeoutMs: 10,
    });

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    scope.dispose();
    scope.dispose();

    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    controller.abort();
    expect(scope.kind).toBeUndefined();
    expect(scope.signal.aborted).toBe(false);
  });

  it('keeps the first abort source when cancellation races the deadline', () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const scope = createRequestAbortScope({
      signal: controller.signal,
      timeoutMs: 10,
    });

    jest.advanceTimersByTime(10);
    controller.abort();

    expect(scope.kind).toBe('timeout');
    expect(() => scope.throwIfAborted()).toThrow(
      expect.objectContaining({name: 'TimeoutError'}),
    );
    scope.dispose();
  });
});
