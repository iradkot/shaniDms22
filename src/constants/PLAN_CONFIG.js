const CGM_STATUS_CODES = {
  TARGET: 'TARGET',
  HIGH: 'HIGH',
  LOW: 'LOW',
  VERY_LOW: 'VERY_LOW',
  VERY_HIGH: 'VERY_HIGH',
};

export const cgmRange = {
  [CGM_STATUS_CODES.TARGET]: {
    min: 70,
    max: 140,
  },
  [CGM_STATUS_CODES.VERY_LOW]: 60,
  [CGM_STATUS_CODES.VERY_HIGH]: 200,
};
