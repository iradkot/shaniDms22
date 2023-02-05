interface CGMStatusCodes {
  TARGET: string;
  HIGH: string;
  LOW: string;
  VERY_LOW: string;
  VERY_HIGH: string;
}
const CGM_STATUS_CODES = {
  TARGET: 'TARGET',
  HIGH: 'HIGH',
  LOW: 'LOW',
  VERY_LOW: 'VERY_LOW',
  VERY_HIGH: 'VERY_HIGH',
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
};
