import React, {createContext, useContext} from 'react';

/**
 * The result of the single app-level Nightscout latest-reading request.
 * `snapshot` stays unknown at this boundary so the product adapter must validate
 * legacy/network-shaped data before showing it.
 */
export interface LatestNightscoutSnapshotState {
  readonly snapshot: unknown;
  readonly isLoading: boolean;
  readonly error: unknown;
}

const EMPTY_LATEST_SNAPSHOT_STATE: LatestNightscoutSnapshotState = {
  snapshot: null,
  isLoading: false,
  error: null,
};

const LatestNightscoutSnapshotStateContext =
  createContext<LatestNightscoutSnapshotState>(EMPTY_LATEST_SNAPSHOT_STATE);

export const LatestNightscoutSnapshotStateProvider = ({
  children,
  value,
}: {
  readonly children: React.ReactNode;
  readonly value: LatestNightscoutSnapshotState;
}) => (
  <LatestNightscoutSnapshotStateContext.Provider value={value}>
    {children}
  </LatestNightscoutSnapshotStateContext.Provider>
);

export const useLatestNightscoutSnapshotState =
  (): LatestNightscoutSnapshotState =>
    useContext(LatestNightscoutSnapshotStateContext);
