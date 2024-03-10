// --- General Data Structures ---

// Represents a timestamp and value pair
export interface TimeValueEntry {
  time: string; // ISO Format
  timeAsSeconds?: number; // Optional for calculations, represents time in seconds since midnight
  value: number;
}

// --- Insulin Data ---

export interface InsulinDataEntry {
  type: 'bolus' | 'tempBasal' | 'suspendPump';
  amount?: number; // for bolus
  rate?: number; // for tempBasal
  duration?: number; // for tempBasal and suspendPump
  suspend?: boolean; // for suspendPump
  startTime?: string; // for tempBasal and suspendPump
  endTime?: string; // for tempBasal and suspendPump
}

// Represents a single insulin dose
export type InsulinDataType = {
  timestamp: string;
  dosage: number;
  type: 'bolus' | 'basal' | 'tempBasal' | 'correction';
};

// Represents a pattern of basal insulin delivery over time
export type BasalProfile = TimeValueEntry[];

// --- Loop (Insulin Management System) Settings ---

interface OverridePreset {
  name: string;
  duration: number; // Duration in seconds
  symbol: string; // Symbol representing the preset (e.g., emoji or short code)
  insulinNeedsScaleFactor: number; // Adjustment factor for insulin needs
}

interface LoopSettings {
  maximumBolus: number;
  maximumBasalRatePerHour: number;
  scheduleOverride: {
    duration: number; // Duration in seconds
    insulinNeedsScaleFactor: number;
  };
  overridePresets: OverridePreset[];
  dosingStrategy: 'tempBasalOnly' | 'manualBolus' | 'automaticBolus'; // Specify known strategies
  deviceToken: string;
  dosingEnabled: boolean;
  preMealTargetRange: [number, number]; // Tuple representing low and high target BG levels
  minimumBGGuard: number; // Minimum blood glucose level to guard against hypoglycemia
  bundleIdentifier: string;
}

// Represents a user's insulin profile within the system
interface StoreProfile {
  units: 'mg/dL' | 'mmol/L'; // Units for blood glucose measurements
  carbs_hr?: number; // Carbohydrates per hour, optional for some profiles
  basal: BasalProfile;
  carbratio: TimeValueEntry[]; // Carbohydrate to insulin ratio
  target_low: TimeValueEntry[];
  target_high: TimeValueEntry[];
  sens: TimeValueEntry[]; // Insulin sensitivity factor
  timezone: string;
  dia: number; // Duration of insulin action in hours
  delay?: number; // Optional delay in insulin delivery or effect, in minutes
}

// Storage for multiple profiles
interface Store {
  [profileName: string]: StoreProfile; // Keyed by profile name
}

// A complete set of Loop user data
interface DataEntry {
  _id: string;
  defaultProfile: string;
  enteredBy: string;
  store: Store;
  units: 'mg/dL' | 'mmol/L'; // Units for blood glucose measurements
  startDate: string; // ISO Format
  loopSettings: LoopSettings;
  mills: number; // UNIX timestamp in milliseconds
}

// A collection of DataEntries
type DataArray = DataEntry[];

// Since 'BasalProfileDataType' was simply an array of DataEntry,
// you can use the DataArray type directly
export type BasalProfileDataType = DataArray;

export interface TempBasalInsulinDataEntry extends InsulinDataEntry {
  eventType: 'Temp Basal';
  insulinType: string;
  syncIdentifier: string;
  temp: string;
  utcOffset: number;
  carbs: null; // Adjust based on actual usage
  insulin: null; // Adjust based on actual usage
}

export interface ProfileDataEntry {
  _id: string;
  store: {
    [profileName: string]: StoreProfile;
  };
  loopSettings: LoopSettings;
  enteredBy: string;
  startDate: string;
  mills: string;
  defaultProfile: string;
  units: 'mg/dL' | 'mmol/L';
}

export type ProfileDataType = ProfileDataEntry[];
