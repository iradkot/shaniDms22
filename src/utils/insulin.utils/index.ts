// app/utils/insulin.utils.js

import { calculateTotalInsulin } from "app/utils/insulin.utils/calculateTotalInsulin";

// Helper function to calculate the base basal rate for a given period
// Helper function to calculate the base basal rate for a given period

// Finds the highest and lowest IOB (Insulin On Board) values
export const findHighestAndLowestIOB = insulinData => {
  // Implement logic to find highest and lowest IOB
  let highestIOB = {value: 0, time: null};
  let lowestIOB = {value: Infinity, time: null};
  // ... logic to calculate IOB and determine highest and lowest
  return {highestIOB, lowestIOB};
};

// Calculates the ratio of basal to bolus insulin
export const calculateBasalBolusRatio = insulinData => {
  // Implement calculation logic
  let basal = 0;
  let bolus = 0;
  // ... logic to calculate basal and bolus totals
  return basal / bolus; // Handle division by zero
};

// Calculates average insulin usage over a period
export const calculateAverageInsulinUsage = (insulinData, basalProfileData) => {
  // Implement calculation logic
  const totalInsulin = calculateTotalInsulin(insulinData, basalProfileData);
  return totalInsulin / insulinData.length;
};

// Calculates the percentage of time glucose levels were within target ranges
export const calculateTimeInRange = insulinData => {
  // Implement calculation logic based on glucose levels and target ranges
  let inRangeCount = 0;
  // ... logic to count in-range instances
  return (inRangeCount / insulinData.length) * 100;
};
