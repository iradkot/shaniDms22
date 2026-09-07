import {BrowserAiService} from '../src/platform/web/ai/browserAiService';
import {
  BrowserNightscoutClient,
  type BrowserNightscoutStatus,
} from '../src/platform/web/nightscout/browserNightscoutClient';
import type {AuthenticatedWebApiClient} from '../src/platform/web/api/authenticatedWebApiClient';
import type {IndexedDbKeyValueStore} from '../src/platform/web/storage';

const CONNECTION_MARKER_PREFIX = 'shani.web.connection-marker.v1:';

export interface ConnectionMarker {
  readonly schemaVersion: 1;
  readonly nightscout: BrowserNightscoutStatus;
  readonly aiConfigured: boolean;
  readonly aiEnabled: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeMarker = (raw: string | null): ConnectionMarker | undefined => {
  if (raw === null) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !isRecord(value.nightscout) ||
      typeof value.nightscout.configured !== 'boolean' ||
      (value.nightscout.sourceId !== undefined &&
        (typeof value.nightscout.sourceId !== 'string' ||
          !/^[A-Za-z0-9._-]{1,160}$/.test(value.nightscout.sourceId))) ||
      (value.nightscout.workspaceId !== undefined &&
        (typeof value.nightscout.workspaceId !== 'string' ||
          !/^[A-Za-z0-9._-]{1,160}$/.test(value.nightscout.workspaceId))) ||
      (value.nightscout.configured &&
        (value.nightscout.sourceId === undefined ||
          value.nightscout.workspaceId === undefined)) ||
      (value.nightscout.displayLabel !== undefined &&
        (typeof value.nightscout.displayLabel !== 'string' ||
          value.nightscout.displayLabel.length > 160)) ||
      typeof value.aiConfigured !== 'boolean' ||
      typeof value.aiEnabled !== 'boolean'
    ) {
      return undefined;
    }
    return value as unknown as ConnectionMarker;
  } catch {
    return undefined;
  }
};

export const emptyMarker = (): ConnectionMarker => ({
  schemaVersion: 1,
  nightscout: {configured: false},
  aiConfigured: false,
  aiEnabled: true,
});

export const markerKey = (uid: string): string =>
  `${CONNECTION_MARKER_PREFIX}${uid}`;

export const resolveConnections = async (input: {
  readonly uid: string;
  readonly api: AuthenticatedWebApiClient;
  readonly storage: IndexedDbKeyValueStore;
}): Promise<ConnectionMarker> => {
  const cached =
    decodeMarker(
      await input.storage.getItem(markerKey(input.uid)).catch(() => null),
    ) ?? emptyMarker();
  const [nightscout, aiConfigured] = await Promise.allSettled([
    BrowserNightscoutClient.status(input.api),
    new BrowserAiService(input.api).status(),
  ]);
  const marker: ConnectionMarker = {
    schemaVersion: 1,
    nightscout:
      nightscout.status === 'fulfilled' ? nightscout.value : cached.nightscout,
    aiConfigured:
      aiConfigured.status === 'fulfilled'
        ? aiConfigured.value
        : cached.aiConfigured,
    aiEnabled: cached.aiEnabled,
  };
  try {
    await input.storage.setItem(markerKey(input.uid), JSON.stringify(marker));
  } catch {
    // A cache write failure must not discard a successful server status.
  }
  return marker;
};
