/**
 * @format
 */

import 'react-native';
import React from 'react';
import extractDailyBasalInsulinPlan from '../src/utils/insulin.utils/extractDailyBasalInsulinPlan';

describe('extractDailyBasalInsulinPlan', () => {
  it('correctly calculates total basal for a given date range', () => {
    const basalProfileSample = [
      { time: "00:00", value: 1.0, timeAsSeconds: 0 },
      { time: "06:00", value: 1.2, timeAsSeconds: 6 * 60 * 60 },
      { time: "22:00", value: 0.9, timeAsSeconds: 22 * 60 * 60 }
    ];
    const startDate = new Date('2023-12-01');
    const endDate = new Date('2023-12-02');

    const totalBasal = extractDailyBasalInsulinPlan(basalProfileSample, startDate, endDate);

    // Check if the calculated total basal is as expected
    expect(totalBasal).toBeCloseTo(54.0);
  });
});
