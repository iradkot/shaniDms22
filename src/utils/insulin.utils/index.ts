// app/utils/insulin.utils.js

import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';
import extractDailyBasalInsulinPlan from 'app/utils/insulin.utils/extractDailyBasalInsulinPlan';

// Helper function to calculate the base basal rate for a given period
// Helper function to calculate the base basal rate for a given period

// Finds the highest and lowest IOB (Insulin On Board) values
export const findHighestAndLowestIOB = insulinData => {};

// Calculates the ratio of basal to bolus insulin
export const calculateBasalBolusRatio = insulinData => {};

// Calculates average insulin usage over a period
export const calculateAverageInsulinUsage = (
  insulinData,
  basalProfileData,
) => {};

// Calculates the percentage of time glucose levels were within target ranges
export const calculateTimeInRange = insulinData => {};

export default {
  findHighestAndLowestIOB,
  calculateBasalBolusRatio,
  calculateAverageInsulinUsage,
  calculateTimeInRange,
  calculateTotalScheduledBasal: extractDailyBasalInsulinPlan,
  calculateTotalInsulin,
};
