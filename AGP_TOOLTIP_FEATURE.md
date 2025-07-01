# AGP Tooltip Feature

## Overview
The AGP (Ambulatory Glucose Profile) chart now includes interactive tooltip functionality that provides detailed glucose statistics when users tap on the chart.

## Components Added

### 1. AGPTooltip.tsx
- **Purpose**: Renders the tooltip popup with detailed glucose data
- **Features**:
  - Shows time of day
  - Displays all percentile values (5th, 25th, 50th/median, 75th, 95th)
  - Color-codes glucose values based on clinical ranges
  - Shows number of readings contributing to the time point
  - Indicates glucose range category
  - Automatically positions itself within chart bounds

### 2. AGPTouchOverlay.tsx  
- **Purpose**: Handles touch interactions and tooltip display logic
- **Features**:
  - Detects touches within chart area
  - Finds closest data point to touch location
  - Shows tooltip for 3 seconds after touch
  - Uses TouchableWithoutFeedback for broad compatibility

### 3. Updated GlucoseTheme.tsx
- **Addition**: `TOOLTIP_STYLES` configuration
- **Features**:
  - Consistent styling across glucose charts
  - Dark theme with good contrast
  - Responsive sizing and positioning

## Usage

The AGP chart now accepts an optional `showTooltip` prop:

```tsx
<AGPChart
  agpData={agpData}
  showTooltip={true}  // Default: true
  // ... other props
/>
```

## Tooltip Information Displayed

When a user taps on the chart, the tooltip shows:

1. **Header**:
   - Time of day (formatted as 12-hour time)
   - Number of readings contributing to that time point

2. **Percentile Data**:
   - 95th percentile (dashed line representation)
   - 75th percentile 
   - **Median (50th percentile)** - highlighted as primary value
   - 25th percentile
   - 5th percentile (dashed line representation)

3. **Clinical Context**:
   - Each glucose value is color-coded based on clinical ranges:
     - Very Low (<54 mg/dL) - Dark Red
     - Low (54-69 mg/dL) - Red  
     - Target (70-180 mg/dL) - Green
     - High (181-250 mg/dL) - Orange
     - Very High (>250 mg/dL) - Deep Orange
   - Shows the glucose range category for the median value

## Technical Implementation

- **Touch Detection**: Uses React Native's TouchableWithoutFeedback for reliable touch handling
- **Data Mapping**: Converts touch coordinates to chart coordinates and finds nearest time point
- **Positioning**: Automatically adjusts tooltip position to stay within chart bounds
- **Styling**: Uses shared theme colors for consistency with chart design
- **Performance**: Minimal impact on chart rendering performance

## Benefits

1. **Enhanced User Experience**: Users can explore detailed glucose patterns interactively
2. **Clinical Insight**: Provides statistical context for glucose readings at specific times
3. **Data Accessibility**: Makes percentile information easily accessible without cluttering the chart
4. **Visual Consistency**: Maintains the same color coding as the chart elements
5. **Mobile Optimized**: Touch-friendly interaction designed for mobile devices

## Backward Compatibility

- The tooltip feature is enabled by default but can be disabled with `showTooltip={false}`
- All existing AGP chart functionality remains unchanged
- No breaking changes to existing API
