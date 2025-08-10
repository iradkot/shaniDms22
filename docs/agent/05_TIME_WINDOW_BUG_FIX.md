# Bug Fix: Time Window Detection & BG Integration

## Issues Fixed

### 1. ❌ Time Window Bug (104 minutes span)
**Problem:** Tooltip showing bolus events spanning 104+ minutes instead of 5 minutes
**Root Cause:** OR condition `(withinTimeWindow || withinSpatialRadius)` allowed spatial detection (40px) to override time constraints
**Fix:** Changed to strict time-first logic - bolus must be within time window FIRST

### 2. ❌ Missing BG Integration  
**Problem:** User wanted to see closest BG reading WITH bolus events, not hidden by them
**Fix:** Always combine BG + bolus events when both available, regardless of their time proximity

## Changes Made

### Fixed Detection Logic (`bolusUtils.ts`)
**Before:**
```typescript
// BUGGY: OR condition caught events hours away
if (withinTimeWindow || withinSpatialRadius) {
  matchingBoluses.push(bolus);
}
```

**After:**
```typescript
// FIXED: Time window is primary constraint
if (withinTimeWindow) {
  matchingBoluses.push(bolus);
}
// Only allow spatial override for slightly extended window (2x max)
else if (withinSpatialRadius && timeDistance <= (DETECTION_WINDOW_MS * 2)) {
  matchingBoluses.push(bolus);
}
```

### Always Show BG + Bolus Together (`CgmGraph.tsx`)
**Before:**
```typescript
// Only combined if BG and bolus within 1 minute
if (bolusesNearBg.length > 0) {
  showCombinedMultiBolusTooltip = true;
} else {
  // Show separate tooltips
}
```

**After:**
```typescript
// ALWAYS show BG + bolus together when both available
if (closestBgSample && nearbyBolusEvents.length > 0) {
  if (nearbyBolusEvents.length > 1) {
    showCombinedMultiBolusTooltip = true; // BG + multi-bolus
  } else {
    showCombinedTooltip = true; // BG + single bolus
  }
}
```

### Added Debug Logging
- Console logs show time distance for each bolus event
- Explains why each event was included/excluded
- Shows final time span of selected events
- Helps identify if detection is working correctly

## Expected Results

### Time Window Enforcement
- **5 minutes max:** Bolus events only within 5-minute window from touch point
- **Spatial override limited:** 40px radius only allows up to 10-minute window (2x safety)
- **No more 104-minute spans:** Strict time enforcement prevents old events

### BG Integration
- **Always combined:** BG reading + bolus events shown together
- **No hiding:** Bolus events don't replace BG data, they complement it
- **Medical context:** See glucose level AND insulin response together

### Debug Information
```
Bolus 2.0U at 2:15:32 PM:
  Time distance: 3 minutes
  Pixel distance: 25px
  Within time window (5min): true
  Within spatial radius (40px): true
  ✅ Added: within 5 minute window

Final result: Found 2 bolus events:
  1. 2.0U at 2:15:32 PM
  2. 1.5U at 2:18:45 PM
  📏 Time span: 3 minutes
```

## Configuration Remains Adjustable

```typescript
export const BOLUS_HOVER_CONFIG = {
  DETECTION_WINDOW_MINUTES: 5,        // Easily adjustable (5, 10, 30)
  SPATIAL_DETECTION_RADIUS: 40,       // Touch area
  MAX_BOLUS_EVENTS_IN_TOOLTIP: 5,     // Max events shown
  BG_BOLUS_COMBINATION_MINUTES: 1,    // Not used anymore (always combined)
};
```

## Testing Needed
1. **Verify time span:** Should never exceed configured window (default 5 minutes)
2. **Check BG integration:** BG reading should always appear with bolus events
3. **Monitor debug logs:** Console should show reasonable time distances
4. **Test edge cases:** Very close bolus events, single events, etc.

This should fix both the 104-minute bug and ensure BG readings are always included with bolus events as requested.
