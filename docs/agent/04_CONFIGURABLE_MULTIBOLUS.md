# Configurable 5-Minute Detection Window & Multi-Bolus Tooltips

## User Request & Solution
**Request:** "Can we make it spread on more minutes? like on 5 minutes or something like this? and that it will be adjustable, so I can even catch 2 bolus events in one tooltip if they have less then 5 minutes diff between them"

**Solution:** Implemented configurable 5-minute detection window with support for multiple bolus events in single tooltip.

## Key Improvements ✅

### 1. Configurable Detection Window
- **New Config File:** `bolusHoverConfig.ts` with adjustable constants
- **5-minute window:** `DETECTION_WINDOW_MINUTES: 5` (easily changeable)
- **Flexible detection:** Both time-based (5 min) AND spatial (40px) detection
- **Medical context:** Perfect for multiple corrections within minutes

### 2. Multi-Bolus Tooltip Support
- **Multiple events:** Shows up to 5 bolus events in one tooltip
- **Total calculation:** Displays sum of all insulin units
- **Individual details:** Lists each bolus with amount and timestamp
- **Time range:** Shows duration if events span multiple minutes

### 3. Smart Tooltip Selection Logic
**Priority Order:**
1. **Combined BG + Multi-Bolus** (when BG and bolus within 1 minute)
2. **Multi-Bolus** (multiple bolus events found)  
3. **Combined BG + Single Bolus** (legacy 1-minute combination)
4. **Individual BG or Bolus** (fallback to single tooltips)

### 4. New Tooltip Components
- **MultiBolusTooltip:** Multiple bolus events only
- **CombinedBgMultiBolusTooltip:** BG reading + multiple bolus events
- **Maintained:** Existing single-event tooltips for backward compatibility

## Configuration Options

```typescript
export const BOLUS_HOVER_CONFIG = {
  DETECTION_WINDOW_MINUTES: 5,        // Time window for bolus detection
  SPATIAL_DETECTION_RADIUS: 40,       // Touch radius in pixels
  MAX_BOLUS_EVENTS_IN_TOOLTIP: 5,     // Max events per tooltip
  BG_BOLUS_COMBINATION_MINUTES: 1,    // BG+bolus combination threshold
};
```

## Real-World Diabetes Scenarios Supported

### Scenario 1: Multiple Corrections
- **Example:** 2U at 2:15 PM, 1.5U at 2:18 PM, 0.5U at 2:20 PM
- **Result:** Shows all three in one tooltip with "Total: 4.0 units" + individual details
- **Time span:** "Over 5 minutes"

### Scenario 2: BG + Multiple Bolus
- **Example:** BG reading 180 at 3:10 PM, bolus 3U at 3:11 PM, correction 1U at 3:13 PM
- **Result:** Combined tooltip showing BG + both bolus events
- **Medical context:** Clear correlation between high BG and insulin response

### Scenario 3: Easier Detection
- **Challenge:** User struggles to tap small markers precisely
- **Solution:** 5-minute window means tapping anywhere near the time period catches all relevant bolus events
- **Spatial backup:** 40px radius still works for precise tapping

## Technical Implementation

### Detection Algorithm:
```typescript
// Include bolus if within EITHER time window OR spatial radius
const withinTimeWindow = timeDistance <= DETECTION_WINDOW_MS;
const withinSpatialRadius = pixelDistance <= spatialRadius;

if (withinTimeWindow || withinSpatialRadius) {
  matchingBoluses.push(bolus);
}
```

### Tooltip Selection:
```typescript
if (bolusesNearBg.length > 0) {
  showCombinedMultiBolusTooltip = true;  // BG + multiple bolus
} else if (nearbyBolusEvents.length > 1) {
  showMultiBolusTooltip = true;          // Multiple bolus only
} else {
  // Fall back to individual tooltips
}
```

## Benefits for Diabetes Management

### Medical Accuracy
- **Complete picture:** See all insulin doses in timeframe, not just closest
- **Total dosing:** Clear view of cumulative insulin given
- **Timing correlation:** Understand sequence of corrections

### Usability
- **Much easier targeting:** 5-minute window vs precise marker tapping
- **Relevant information:** All related bolus events, not just one
- **Configurable:** Can adjust detection window based on user needs

### Visual Clarity
- **No clutter:** Still uses clean diamond markers without text
- **Comprehensive tooltips:** All details available on successful touch
- **Smart prioritization:** Shows most relevant combination automatically

## Adjustability & Future Expansion

### Easy Configuration Changes
- **Detection window:** Change `DETECTION_WINDOW_MINUTES` for different time spans
- **Event limit:** Adjust `MAX_BOLUS_EVENTS_IN_TOOLTIP` for more/fewer events
- **Spatial sensitivity:** Modify `SPATIAL_DETECTION_RADIUS` for touch precision
- **BG combination:** Tune `BG_BOLUS_COMBINATION_MINUTES` for correlation threshold

### Potential Extensions
- **User preferences:** Could make detection window user-configurable in settings
- **Context awareness:** Different detection windows for different times of day
- **Insulin type support:** Different handling for basal vs bolus in future

This implementation provides exactly what the user requested: configurable detection that catches multiple bolus events within a reasonable timeframe, making the chart much more practical for real diabetes management scenarios.
