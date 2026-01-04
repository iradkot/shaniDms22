export type DeviceStatusEntry = {
  created_at?: string; // ISO
  mills?: number; // ms timestamp

  // Loop uploader payload (common)
  loop?: {
    iob?: {
      iob?: number;
      timestamp?: string;
      bolusIob?: number;
      basalIob?: number;
    };
    cob?: {
      cob?: number;
      timestamp?: string;
    };

    /**
     * Loop prediction payload (when enabled).
     * Shape varies by uploader/version; this is a best-effort typed subset.
     */
    predicted?: {
      values?: number[];
      timestamps?: Array<string | number>;
    };

    [key: string]: unknown;
  };

  // Loop/OpenAPS commonly nests these under openaps.
  openaps?: {
    iob?: {
      iob?: number;
      basaliob?: number;
      bolusiob?: number;
    };
    cob?: {cob?: number};
    meal?: {cob?: number};
  };

  // Some setups expose fields at the top level.
  iob?: number;
  cob?: number;

  // Allow unknown shapes without losing type safety elsewhere.
  [key: string]: unknown;
};
