// ---------------------------------------------------------------------------
// Generic promise-with-timeout utility
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout.
 *
 * @param promise  The work to execute.
 * @param ms       Timeout duration in milliseconds.
 * @param label    Human-readable label for the error message.
 * @returns        The resolved value of `promise`, or throws on timeout.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
  });

  return (Promise.race([promise, timeout]) as Promise<T>).then(
    value => {
      if (timer) clearTimeout(timer);
      return value;
    },
    error => {
      if (timer) clearTimeout(timer);
      throw error;
    },
  );
}
