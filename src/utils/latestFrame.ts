/** Coalesce transient UI input; data and durable events must never use this. */
export function createLatestFrame<T>(commit: (value: T) => void) {
  let frame: number | null = null;
  let pending: {value: T} | null = null;
  const cancel = () => {
    if (frame !== null) {cancelAnimationFrame(frame);}
    frame = null;
    pending = null;
  };
  const flush = () => {
    const latest = pending;
    cancel();
    if (latest) {commit(latest.value);}
  };
  return {
    schedule(value: T) {
      pending = {value};
      if (frame === null) {frame = requestAnimationFrame(flush);}
    },
    flush,
    cancel,
  };
}
