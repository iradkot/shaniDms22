// app/utils/insulin.utils.js

import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';
import extractDailyBasalInsulinPlan from 'app/utils/insulin.utils/extractDailyBasalInsulinPlan';

// Helper function to calculate the base basal rate for a given period
// Helper function to calculate the base basal rate for a given period

// Finds the highest and lowest IOB (Insulin On Board) values
export const findHighestAndLowestIOB = (_insulinData: unknown) => {};

// Calculates the ratio of basal to bolus insulin
export const calculateBasalBolusRatio = (_insulinData: unknown) => {};

// Calculates average insulin usage over a period
export const calculateAverageInsulinUsage = (
  _insulinData: unknown,
  _basalProfileData: unknown,
) => {};

// Calculates the percentage of time glucose levels were within target ranges
export const calculateTimeInRange = (_insulinData: unknown) => {};

export default {
  findHighestAndLowestIOB,
  calculateBasalBolusRatio,
  calculateAverageInsulinUsage,
  calculateTimeInRange,
  calculateTotalScheduledBasal: extractDailyBasalInsulinPlan,
  calculateTotalInsulin,
};
