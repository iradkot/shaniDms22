import {useEffect, useState} from 'react';

export const PRODUCT_CLOCK_REFRESH_INTERVAL_MS = 60_000;

export interface RefreshingNowOptions {
  readonly active?: boolean;
  readonly intervalMs?: number;
  readonly now?: () => number;
}

const systemNow = (): number => Date.now();

/** Keeps age- and duration-based product copy fresh without a global timer. */
export const useRefreshingNow = (
  options: RefreshingNowOptions = {},
): number => {
  const {
    active = true,
    intervalMs = PRODUCT_CLOCK_REFRESH_INTERVAL_MS,
    now = systemNow,
  } = options;
  const [value, setValue] = useState(() => now());

  useEffect(() => {
    setValue(now());
    if (!active) {
      return undefined;
    }
    const timer = setInterval(() => setValue(now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, now]);

  return value;
};
