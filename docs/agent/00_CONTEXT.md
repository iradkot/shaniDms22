# Context for Chart Tooltip Positioning Fix

## User Intent
- **Original request:** Fix chart tooltip issues where finger hides tooltip and tooltip goes out of bounds
- **Underlying problem:** Poor UX in touch interfaces due to finger occlusion and overflow issues  
- **Success criteria:** 
  1. Tooltip positioned to avoid finger occlusion
  2. Tooltip stays within container boundaries
  3. Smart positioning based on touch location and container size

## Related Code

### Components:
- **Tooltip Components:** 
  - `src/components/CgmGraph/components/Tooltips/CombinedBgBolusTooltip.tsx`
  - `src/components/CgmGraph/components/Tooltips/MultiBolusTooltip.tsx`
  - `src/components/CgmGraph/components/Tooltips/CombinedBgMultiBolusTooltip.tsx`
  - `src/components/CgmGraph/components/Tooltips/SgvTooltip.tsx` (likely exists)
  - `src/components/CgmGraph/components/Tooltips/BolusTooltip.tsx` (likely exists)

- **Chart Integration:** `src/components/CgmGraph/CgmGraph.tsx` (main graph component that shows tooltips)

### Hooks:
- **Touch Handling:** `src/components/CgmGraph/hooks/useTouchHandler.ts` - handles touch events

### Utils:
- **Proximity:** `src/components/CgmGraph/utils/bolusUtils.ts` - proximity calculations
  
### Constants: 
- **Styling:** `src/components/shared/GlucoseChart/GlucoseTheme.tsx` (TOOLTIP_STYLES usage)
  
### Integration points:
- **Home Screen:** Chart in collapsible section
- **Trends Screen:** Various chart components  
- **AGP Components:** May use similar tooltips

### Existing tests:
- **Tooltip Tests:** `src/components/CgmGraph/components/Tooltips/CombinedBgBolusTooltip.test.tsx`

## Current Issues Identified
1. **Finger Occlusion:** All tooltips position above the touch point (`y - height - 20`), but finger covers this area
2. **Out of Bounds:** Only basic horizontal bounds checking, no smart repositioning
3. **Fixed Positioning:** No dynamic positioning based on available space
4. **Touch Area:** No consideration of finger size/touch area

## Current Positioning Logic
- **Horizontal:** Center on touch point, then clamp to container bounds
- **Vertical:** Always above touch point with fixed 20px offset
- **No consideration** for finger position or available space

## Design Decisions

### Why smart positioning is needed:
- **Touch UX:** Mobile diabetes management requires finger-friendly interactions
- **Critical data:** Glucose readings must be clearly visible without obstruction
- **Container bounds:** Tooltips must stay visible within chart boundaries
- **Consistent behavior:** All tooltip types should use same positioning logic

### Alternatives considered:
- **Option A:** Smart quadrant-based positioning (CHOSEN) - positions away from finger
- **Option B:** Always show above - current broken behavior
- **Option C:** Floating overlay outside chart - breaks existing UX patterns

## Medical/Safety Considerations
- **Glucose thresholds** from PLAN_CONFIG.ts must remain accurate
- **Tooltip content accuracy** is critical for diabetes management
- **Visual positioning** should not compromise medical data readability
- **Touch responsiveness** is important for emergency glucose readings

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
