# Context for Bolus Events on Home Chart

## User Intent
- **Original request:** Add bolus events to the chart in the Home tab with hover functionality
- **Underlying problem:** Currently, the Home tab chart only shows BG/CGM data and food items, but doesn't display insulin bolus events, which are critical for diabetes management correlation
- **Success criteria:** 
  - Bolus events appear as markers/points on the chart
  - Hover/touch shows bolus details (amount, time, type)
  - Visually distinct from BG data points
  - Integration works with existing chart infrastructure

## Related Code

### Components:
- **Home Tab:** `src/containers/MainTabsNavigator/Containers/Home/Home.tsx` (main integration point)
- **Chart Component:** `src/components/CgmGraph/CgmGraph.tsx` (main chart container)
- **CGM Renderer:** `src/components/CgmGraph/components/CGMSamplesRenderer.tsx` (handles BG points)
- **Food Renderer:** `src/components/CgmGraph/components/Food/FoodItemsRenderer.tsx` (existing hover example)

### Hooks:
- **useInsulinData:** `src/hooks/useInsulinData.ts` (already provides bolus data)
- **useTouchContext:** `src/components/CgmGraph/contextStores/TouchContext.tsx` (handles touch/hover)

### Utils:
- **findClosestBgSample:** `src/components/CgmGraph/utils.ts` (pattern for closest item detection)

### Constants: 
- **PLAN_CONFIG:** `src/constants/PLAN_CONFIG.ts` (glucose thresholds)
- **Chart Colors:** `src/components/shared/GlucoseChart.ts` (color constants)

### Integration points:
- **Home Screen:** Chart is in collapsible "chart" section
- **Data Flow:** Home → BgGraph → (new) BolusRenderer
- **Existing hover:** SgvTooltip pattern for BG data

### Existing tests:
- Need to identify existing chart component tests to extend

## Design Decisions

### Why this approach:
- **Follow existing patterns:** Used same rendering approach as FoodItemsRenderer for consistency  
- **Leverage existing infrastructure:** Touch detection, tooltip system, GraphStyleContext already work
- **Medical safety:** Used clear visual distinction for insulin vs BG data (orange diamonds vs green circles)
- **Performance:** Reused existing scales and hit detection logic

### Alternatives considered:
- **Option A:** Add bolus as overlay diamonds (CHOSEN) - clean, follows food item pattern
- **Option B:** Show as vertical lines - less clear for precise amounts
- **Option C:** Integrated into existing BG renderer - too complex, different data types

### User feedback incorporated:
- User wanted boluses visible on chart
- Implemented as distinct visual markers with hover functionality
- Used orange color theme to distinguish from glucose data
- **User requested combined tooltip for better usability:** Small bolus markers were hard to touch precisely, so created combined tooltip when BG and bolus are within 1 minute
- **Visual units display:** Added size scaling based on insulin amount and always-visible unit labels below markers
- **Fixed overlapping labels:** Removed always-visible unit labels that were overlapping and hard to read, now units only show in tooltips
- **Improved hover detection:** Added spatial proximity detection (40px radius) instead of just time-based, making bolus markers much easier to tap
- **Configurable detection window:** Expanded to 5-minute time window for catching bolus events, adjustable via BOLUS_HOVER_CONFIG
- **Multiple bolus support:** Can now show multiple bolus events (up to 5) in one tooltip when they occur within detection window

## Implementation Results

### Files Created:
- **BolusRenderer.tsx** - Main component rendering all bolus events
- **BolusItem.tsx** - Individual bolus marker (diamond shape)
- **BolusTooltip.tsx** - Hover tooltip showing bolus details  
- **CombinedBgBolusTooltip.tsx** - Combined tooltip showing both BG and bolus when within 1 minute
- **MultiBolusTooltip.tsx** - Tooltip showing multiple bolus events within detection window
- **CombinedBgMultiBolusTooltip.tsx** - Combined tooltip with BG + multiple bolus events
- **bolusUtils.ts** - Utilities for closest bolus detection and formatting
- **bolusHoverConfig.ts** - Configurable constants for detection windows and limits
- **index.ts** - Component exports (tooltips)

### Files Modified:
- **CgmGraph.tsx** - Added BolusRenderer integration and hover logic
- **Home.tsx** - Passed insulin data to chart component

### Visual Implementation:
- **Shape:** Orange diamond markers (45° rotated circles)
- **Size:** Scales with bolus amount (3-7px radius for 0.5-10+ units)
- **Position:** Fixed Y-level at 50 mg/dL for consistency
- **Labels:** ~~Shows insulin amount (e.g., "4.2U") below each marker~~ **REMOVED** - Caused overlapping and visual clutter
- **Hover:** Spatial proximity detection (40px radius) for easy mobile touch
- **Colors:** Orange theme color (distinct from BG green/red)
- **Units Display:** Only shown in tooltips to prevent overlapping

### Improvements Made:
- **Visual Units:** ~~Bolus amounts now visible as text labels below markers~~ **REMOVED** - Fixed overlapping labels issue
- **Size Scaling:** Marker size reflects insulin dose (larger = more units) - **PRESERVED**
- **Better Hover:** ~~Fixed hover detection with proximity-based tooltip logic~~ **UPGRADED** to spatial proximity detection
- **Enhanced Tooltip:** Improved positioning and visual design
- **Debug Logging:** Added console logs to help troubleshoot data flow
- **Combined Tooltip:** When BG and bolus occur within 1 minute, show both in single tooltip for better usability
- **Smart Tooltip Selection:** Prioritizes combined tooltip > individual tooltips based on time proximity
- **Spatial Hover Detection:** 40px radius touch area around bolus markers for much easier mobile tapping
- **Clean Visual Design:** Removed overlapping text labels, rely on tooltips for unit information
- **Configurable Detection Window:** 5-minute time window for bolus detection, adjustable via config constants
- **Multi-Bolus Tooltips:** Shows multiple bolus events in one tooltip when within detection window (up to 5 events)
- **Smart Tooltip Priority:** Combined BG+multi-bolus > multi-bolus > individual tooltips based on available data

## Medical/Safety Considerations

### Glucose thresholds used:
- Use existing PLAN_CONFIG constants for any glucose-related calculations
- No new hardcoded medical values

### Calculation accuracy:
- Bolus data comes directly from Nightscout API (medical device source)
- No data transformation that could affect dosing information
- Display actual timestamp and amount from insulin data

### Risk mitigations:
- Clear visual separation between BG data and insulin data
- Distinct colors/shapes to prevent confusion
- Preserve exact bolus amounts and timestamps
- Follow existing touch/hover patterns for consistency
- Test with real insulin data to ensure accuracy

## Data Structure Analysis

### InsulinDataEntry (bolus events):
```typescript
{
  type: 'bolus',
  amount: number,      // Units of insulin
  timestamp: string,   // ISO timestamp
}
```

### Integration with existing chart:
- **X-axis:** timestamp maps to existing date scale
- **Y-axis:** Position bolus markers at consistent glucose level (e.g., 50 mg/dL) 
- **Hover data:** amount, timestamp, calculated time since bolus
- **Visual:** Distinct color/shape from BG circles and food rectangles
