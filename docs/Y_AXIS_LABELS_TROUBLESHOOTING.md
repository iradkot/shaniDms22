# Y-Axis Labels Troubleshooting Guide

## Issue
Y-axis labels (blood glucose values) are not visible in the AGP chart, only X-axis labels (times) are showing.

## Changes Made

### 1. Updated ChartAxes.tsx
- Repositioned Y-axis labels to `x={-12}` to ensure they're within the 65px left margin
- Added enhanced debugging to track Y-scale function and positioning
- Set font size to 12px with 600 weight for better visibility

### 2. Expected Y-axis Labels
The major glucose grid lines should display these values:
- 40, 70, 100, 140, 180, 250, 300 mg/dL

## Testing Instructions

### 1. Check Console Logs
Look for these debug messages in your React Native debugger or console:
```
[ChartAxes] Enhanced Debug Info: { majorGridLines: [...], yScaleDomain: [...], ... }
[ChartAxes] Y-label 70: yPos=120, chartHeight=200
```

### 2. Verify Chart Layout
The AGP chart should have:
- Left margin: 65px (space for Y-axis labels)
- Right margin: 35px  
- Chart width: screenWidth - 10px (minimum 350px)

### 3. Expected Behavior
- Y-axis labels should appear on the left side of the chart
- Labels should show glucose values like 70, 100, 140, 180, etc.
- Labels should be positioned at the corresponding glucose levels on the chart

## Possible Issues & Solutions

### Issue 1: Labels Outside SVG Viewport
**Solution**: Y-axis labels are now positioned at `x={-12}` which should be well within the 65px left margin.

### Issue 2: Y-Scale Function Not Working
**Check**: Console logs should show valid `yPos` values for each glucose level.

### Issue 3: Labels Invisible Due to Styling
**Check**: Labels are now styled with `fill="#333333"` and `fontWeight="600"` for maximum visibility.

### Issue 4: Grid Lines Not Being Generated
**Check**: Console logs should show `majorGridLines` array with glucose values.

## Quick Test

To quickly verify Y-axis labels are working:

1. Open the app and navigate to Trends > AGP Analytics
2. Check browser/debugger console for `[ChartAxes]` log messages
3. Look for Y-axis labels on the left side of the AGP chart
4. Values should appear at: 70, 100, 140, 180, etc. (depending on your data range)

## If Still Not Working

If Y-axis labels are still not visible, the issue might be:
1. SVG clipping - check if the SVG viewport is properly sized
2. React Native SVG Text rendering - might need platform-specific adjustments
3. Data range - if all glucose values are outside the expected range

Let me know what you see in the console logs and I can provide further debugging steps.
