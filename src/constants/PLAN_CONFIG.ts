interface CGMStatusCodes {
  TARGET: string;
  HIGH: string;
  LOW: string;
  VERY_LOW: string;
  VERY_HIGH: string;
  SERIOUS_LOW: string;
  SERIOUS_HIGH: string;
  EXTREME_LOW: string;
  EXTREME_HIGH: string;
}
export const CGM_STATUS_CODES = {
  TARGET: 'TARGET',
  HIGH: 'HIGH',
  LOW: 'LOW',
  VERY_LOW: 'VERY_LOW',
  VERY_HIGH: 'VERY_HIGH',
  SERIOUS_LOW: 'SERIOUS_LOW',
  SERIOUS_HIGH: 'SERIOUS_HIGH',
  EXTREME_LOW: 'EXTREME_LOW',
  EXTREME_HIGH: 'EXTREME_HIGH',
};

interface CgmRange {
  TARGET: {
    min: number;
    max: number;
  };
  [x: string]: number | {min: number; max: number};
}

export const cgmRange: CgmRange = {
  TARGET: {
    min: 70,
    max: 140,
  },
  [CGM_STATUS_CODES.VERY_LOW]: 60,
  [CGM_STATUS_CODES.VERY_HIGH]: 200,
  // Clinical-style cutoffs for event counting + color scaling.
  [CGM_STATUS_CODES.SERIOUS_LOW]: 56,
  [CGM_STATUS_CODES.SERIOUS_HIGH]: 220,
  [CGM_STATUS_CODES.EXTREME_LOW]: 55,
  [CGM_STATUS_CODES.EXTREME_HIGH]: 250,
};
