# Testing the AGP Improvements

## How to Test the Changes

### 1. Open the App and Navigate to Trends
1. Launch the React Native app
2. Navigate to the "Trends" screen
3. Look for the "Ambulatory Glucose Profile (AGP)" collapsible section
4. Expand the AGP section

### 2. What to Look For

#### Visual Improvements:
- **Chart Width**: The chart should now use nearly the full width of the screen
- **Grid Lines**: Both horizontal and vertical grid lines should be clearly visible
- **Axis Labels**: 
  - Y-axis labels (glucose values) should be properly positioned and readable
  - X-axis labels (time) should be clearly visible and not overlapping
- **Overall Layout**: Chart should look more balanced and professional

#### Data Quality Display:
- Check the green bar at the bottom of the AGP chart
- It should display: "Data Quality: EXCELLENT • X days • Y readings"
- The "X days" should match the number of days selected in Trends (usually 7)
- If still showing "4 days", we need to investigate further with the debug logs

### 3. Debug Information in Logs

Look for these console logs (use `adb logcat -s ReactNativeJS` or check React Native debugger):

```
[TrendsMainContent] Rendering with data: {
  bgDataCount: X,
  firstSample: "...",
  lastSample: "...",
  rangeDays: 7,
  chartWidth: XXX,
  screenWidth: XXX
}

[AGPGraph] Processing data: {
  sampleCount: X,
  dataQuality: "excellent",
  hasValidData: true,
  dateRange: { days: X },
  spanDays: X,
  statistics: {...}
}

[getDateRange] Date calculation: {
  sampleCount: X,
  uniqueCalendarDays: X,
  uniqueDaysList: [...]
}
```

### 4. Issues to Check

If problems persist:

1. **Day count mismatch**: 
   - Compare `rangeDays` in TrendsMainContent vs `dateRange.days` in AGPGraph
   - Check if `uniqueCalendarDays` matches expected count

2. **Chart too narrow**:
   - Check `chartWidth` and `screenWidth` in logs
   - Chart should be close to `screenWidth - 40`

3. **Poor grid visibility**:
   - X-axis grid lines should span full chart height
   - All time labels should be visible

### 5. Expected Values

For a typical 7-day trends view:
- `rangeDays`: 7
- `dateRange.days`: 7
- `chartWidth`: ~350-400 (depending on phone width)
- `dataQuality`: "excellent" or "good"
- Time labels: Should show "12 AM", "2 AM", "4 AM", etc.

## Next Steps if Issues Persist

1. **Day Count Issue**: If still showing wrong days, the data might be filtered during validation. Check validation logs.

2. **Width Issue**: If chart is still narrow, check if the Dimensions import and calculation are working.

3. **Grid Issue**: If x-axis grid lines are missing, check that timePoints are being generated correctly.

Report any persistent issues with the debug log output for further investigation.
