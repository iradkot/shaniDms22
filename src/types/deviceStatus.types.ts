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
