export type InsulinDataType = {
  timestamp: string; // Assuming ISO format for simplicity
  dosage: number; // Insulin dosage in units
  type: string; // Type of insulin (e.g., rapid-acting, long-acting)
};

interface TimeValueEntry {
  time: string;
  timeAsSeconds: number;
  value: number;
}

interface OverridePreset {
  name: string;
  duration: number;
  symbol: string;
  insulinNeedsScaleFactor: number;
}

interface LoopSettings {
  maximumBolus: number;
  maximumBasalRatePerHour: number;
  scheduleOverride: {
    duration: number;
    insulinNeedsScaleFactor: number;
  };
  overridePresets: OverridePreset[];
  dosingStrategy: string;
  deviceToken: string;
  dosingEnabled: boolean;
  preMealTargetRange: number[];
  minimumBGGuard: number;
  bundleIdentifier: string;
}

export type BasalProfile = TimeValueEntry[];

interface StoreProfile {
  units: string;
  carbs_hr: string;
  basal: BasalProfile;
  carbratio: TimeValueEntry[];
  target_low: TimeValueEntry[];
  target_high: TimeValueEntry[];
  sens: TimeValueEntry[];
  timezone: string;
  dia: number;
  delay: string;
}

interface Store {
  [key: string]: StoreProfile;
}

interface DataEntry {
  _id: string;
  defaultProfile: string;
  enteredBy: string;
  store: Store;
  units: string;
  startDate: string;
  loopSettings: LoopSettings;
  mills: string;
}

type DataArray = DataEntry[];

export type BasalProfileDataType = DataArray;
