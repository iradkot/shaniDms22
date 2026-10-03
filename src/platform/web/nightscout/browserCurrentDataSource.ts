import {
  createCurrentDataSource,
  type CurrentDataSource,
} from '../../../modules/currentData';
import type {BrowserNightscoutClient} from './browserNightscoutClient';

const CURRENT_WINDOW_MS = 2 * 60 * 60 * 1_000;

export type BrowserCurrentDataClient = Pick<BrowserNightscoutClient, 'readEntries'> &
  Partial<Pick<BrowserNightscoutClient, 'readDeviceStatuses' | 'assertCurrentSource'>>;

/** The browser proxy has bounded ranges; current facts never depend on a history read. */
export const createBrowserCurrentDataSource = (input: {
  readonly client: BrowserCurrentDataClient;
  readonly getScopeKey?: () => string;
  readonly now?: () => number;
}): CurrentDataSource => {
  const now = input.now ?? (() => Date.now());
  return createCurrentDataSource({
    now,
    getScopeKey: () => {
      input.client.assertCurrentSource?.();
      return input.getScopeKey?.() ?? 'browser-current-source';
    },
    readGlucose: () => {
      const endMs = now();
      return input.client.readEntries(endMs - CURRENT_WINDOW_MS, endMs + 1);
    },
    readDeviceStatus: () => {
      if (!input.client.readDeviceStatuses) {
        return Promise.reject(new Error('Device status is unavailable.'));
      }
      const endMs = now();
      return input.client.readDeviceStatuses(endMs - CURRENT_WINDOW_MS, endMs);
    },
  });
};
