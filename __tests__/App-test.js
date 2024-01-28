/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../src/App';
import { calculateTotalScheduledBasal } from '../src/calculateTotalScheduledBasal'; // Adjust the path as necessary

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

it('renders correctly', () => {
  renderer.create(<App />);
});

describe('calculateTotalScheduledBasal function', () => {
  it('correctly calculates total basal for a given date range', () => {
    const basalProfileSample = [
      { time: "00:00", value: 1.0 },
      { time: "06:00", value: 1.2 },
      { time: "22:00", value: 0.9 }
    ];
    const startDate = new Date('2023-12-01');
    const endDate = new Date('2023-12-02');

    const totalBasal = calculateTotalScheduledBasal(basalProfileSample, startDate, endDate);

    // Check if the calculated total basal is as expected
    expect(totalBasal).toBeCloseTo(24.6); // Replace with the expected value based on your calculation logic
  });
});
