# AGP Debug and Improvements Summary

## Issues Addressed

### 1. Data Quality Display Issue
**Problem**: AGP shows "4 days" instead of expected "7 days" from Trends data

**Debug Changes Made**:
- Added extensive logging in `AGPGraph.tsx` to track data flow
- Added debugging in `getDateRange()` to see how days are calculated  
- Added debugging in `getTimeSpanDays()` to compare time calculations
- Added validation debugging in `validateBgSamples()` to track sample filtering
- Added debugging in `TrendsMainContent.tsx` to track data flow from Trends

**Key Changes**:
- Updated `getDateRange()` to count unique calendar days instead of using `Math.ceil()` 
- This provides more accurate day count based on actual data coverage

### 2. Chart Width and Mobile Responsiveness  
**Problem**: Chart not using full phone width, causing poor x-axis display

**Improvements Made**:
- Updated `TrendsMainContent.tsx` to use `Dimensions.get('window').width`
- Calculate dynamic chart width: `Math.max(screenWidth - 40, 320)`
- Charts now use full screen width minus padding
- Improved margins in `AGP_DEFAULT_CONFIG` for better space utilization

### 3. Chart Axis and Grid Improvements
**Improvements Made**:
- Updated chart margins: top: 20, right: 20, bottom: 40, left: 60
- Improved Y-axis label positioning (x: -8 instead of -5)
- Increased Y-axis label font size (12 instead of 11)
- Improved X-axis label positioning (y: chartHeight + 25 instead of +20)
- Increased X-axis label font size (11 instead of 10)
- Added opacity to grid lines for better visibility

## Debug Logs to Monitor

When running the app, watch for these console logs:

### Data Flow Debugging:
```
[TrendsMainContent] Rendering with data: {
  bgDataCount, firstSample, lastSample, rangeDays, chartWidth, screenWidth
}

[AGPGraph] Processing data: {
  sampleCount, dataQuality, hasValidData, dateRange, spanDays, statistics
}

[validateBgSamples] Time span analysis: {
  originalSampleCount, validSampleCount, timeSpanDays, minRequiredDays
}
```

### Date Range Debugging:
```
[getDateRange] Date calculation: {
  sampleCount, uniqueCalendarDays, uniqueDaysList, timeDiffDays
}

[getTimeSpanDays] Time span calculation: {
  sampleCount, calculatedSpanDays, firstDate, lastDate
}
```

## Expected Results

1. **Correct Day Count**: AGP should now show the same number of days as Trends (7 days)
2. **Full Width Charts**: Charts should span nearly the full phone width
3. **Better Grid Display**: X-axis grid lines should be more visible and properly spaced
4. **Clearer Labels**: Axis labels should be more readable with improved positioning

## Files Modified

1. `src/components/AGPGraph/AGPGraph.tsx` - Added debugging, improved logging
2. `src/containers/MainTabsNavigator/Containers/Trends/components/TrendsMainContent.tsx` - Dynamic width, debugging
3. `src/components/AGPGraph/utils/percentile.utils.ts` - Fixed date range calculation, added debugging
4. `src/components/AGPGraph/utils/validation.utils.ts` - Added validation debugging
5. `src/components/AGPGraph/utils/constants.ts` - Improved chart margins
6. `src/components/AGPGraph/components/chart/ChartAxes.tsx` - Better label positioning and sizing
7. `src/components/AGPGraph/components/chart/ChartGrid.tsx` - Added opacity for better grid visibility

## Testing Steps

1. Open Trends screen
2. Expand "Ambulatory Glucose Profile (AGP)" section
3. Check console logs for debugging information
4. Verify:
   - Day count matches Trends period (e.g., 7 days)
   - Chart uses full phone width
   - X-axis labels are clearly visible
   - Grid lines are properly displayed
   - Data quality shows correct reading count

## Next Steps

If "4 days" issue persists:
1. Check console logs to see if data is being filtered during validation
2. Compare `bgData` count between Trends and AGP
3. Verify date range calculation in debugging logs
4. Check if validation is removing too many samples
