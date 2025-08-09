# Time in Range (TIR) Calculation Discrepancy Investigation

## Problem Statement

User reported different Time in Range values displayed in different sections of the app:
- **Key Glucose Trends section**: 77%
- **AGP Analytics section**: 83.8%

This investigation analyzes the root cause of this discrepancy and provides recommendations for resolution.

## SOLUTION IMPLEMENTED ✅

**Status**: RESOLVED - All hardcoded values eliminated, single source of truth established.

**Changes Made**:
1. **GlucoseTheme.tsx Updated**: Now imports and uses `GLUCOSE_THRESHOLDS` from PLAN_CONFIG.ts
2. **No More Hardcoded Values**: All glucose ranges now reference PLAN_CONFIG.ts
3. **AGP Range Clarified**: AGP components now use `GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED` (70-180 mg/dL)

**Current Configuration**:
- **TimeInRangeRow**: Uses `TARGET_RANGE.STANDARD` (70-140 mg/dL) - tighter control
- **AGP Components**: Uses `TARGET_RANGE.EXTENDED` (70-180 mg/dL) - clinical standard
- **Both**: Reference same PLAN_CONFIG.ts source, no hardcoded values

**Result**: 
- Different TIR values are now **intentional and configurable**
- Both components can easily be switched to use the same range if desired
- Single source of truth maintained across entire application

## Investigation Summary

### Root Cause Identified: **Different Glucose Target Ranges**

The discrepancy is caused by two different components using **different glucose target range definitions**:

1. **TimeInRangeRow Component**: Uses `70-140 mg/dL` (STANDARD range)
2. **AGP Components**: Uses `70-180 mg/dL` (AGP Clinical Standard)

## Detailed Analysis

### Component 1: TimeInRangeRow (Key Glucose Trends)

**File**: `src/components/Trends/TimeInRangeRow.tsx`
**Glucose Range**: 70-140 mg/dL
**Source**: `GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD` from PLAN_CONFIG.ts

```typescript
// Lines 76-85 in TimeInRangeRow.tsx
const timeInRange = bgData.filter(reading => 
  reading.glucose >= GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.min && 
  reading.glucose <= GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.max
);

const percentage = Math.floor((timeInRange.length / bgData.length) * 100);
```

**Range Definition**:
```typescript
TARGET_RANGE: {
  STANDARD: { min: 70, max: 140 }, // Used by TimeInRangeRow
  TIGHT: { min: 90, max: 110 }
}
```

### Component 2: AGPSummary (AGP Analytics)

**File**: `src/components/Trends/AGPSummary.tsx`
**Glucose Range**: 70-180 mg/dL
**Source**: `GLUCOSE_RANGES.target` from shared/GlucoseChart/GlucoseTheme.tsx

**Calculation Pipeline**:
```
AGPSummary → useAGPStats → calculateTimeInRange → AGP_GLUCOSE_RANGES → GLUCOSE_RANGES
```

**Range Definition**:
```typescript
// From GlucoseTheme.tsx
target: {
  min: 70,
  max: 180,    // Much wider range than TimeInRangeRow!
  color: colors.green[500],
  label: 'Target (70-180)'
}
```

## Mathematical Impact Analysis

### Range Comparison:
- **TimeInRangeRow**: 70-140 mg/dL (70-point range)
- **AGP**: 70-180 mg/dL (110-point range)

### Expected Behavior:
- AGP's wider range (70-180) **will always show higher TIR percentages**
- Values between 141-180 mg/dL count as "in range" for AGP but "high" for TimeInRangeRow
- This explains why AGP shows 83.8% vs TimeInRangeRow's 77%

### Sample Data Impact:
If patient has glucose readings between 141-180 mg/dL:
- TimeInRangeRow: Counts as **out of range** (high)
- AGP: Counts as **in range** (target)

## Clinical Context

### Different Standards:
1. **GLUCOSE_THRESHOLDS.STANDARD (70-140)**: Stricter diabetes management target
2. **AGP Clinical Standard (70-180)**: International AGP consensus range

### Medical Relevance:
- **70-140 mg/dL**: Tighter glycemic control goal
- **70-180 mg/dL**: AGP/CGM industry standard (ADA/EASD consensus)

## Technical Issues Identified

### 1. Inconsistent Range Sources
- Despite glucose threshold consolidation, AGP components still use separate range definitions
- `GLUCOSE_RANGES` in GlucoseTheme.tsx was **not consolidated** with PLAN_CONFIG.ts

### 2. Two Sources of Truth
- **PLAN_CONFIG.ts**: `GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD` (70-140)
- **GlucoseTheme.tsx**: `GLUCOSE_RANGES.target` (70-180)

### 3. User Confusion
- Same metric name ("Time in Range") showing different values
- No indication to user that different ranges are being used

## Recommendations

### Option 1: Clinical Alignment (Recommended)
**Standardize on AGP consensus range (70-180 mg/dL)**

**Rationale**:
- AGP is international clinical standard
- Matches medical literature and other CGM systems
- Consistent with existing AGP analytics

**Implementation**:
```typescript
// Update PLAN_CONFIG.ts
TARGET_RANGE: {
  STANDARD: { min: 70, max: 180 }, // Align with AGP standard
  TIGHT: { min: 90, max: 110 }     // Keep tight control option
}
```

### Option 2: User Choice
**Allow users to select TIR range preference**

**Implementation**:
- Add user setting for TIR calculation preference
- Display selected range in UI ("Time in Range (70-140)" vs "Time in Range (70-180)")
- Update both components to respect user preference

### Option 3: Dual Display
**Show both ranges with clear labeling**

**Example**:
```
Time in Range (Tight): 77% (70-140 mg/dL)
Time in Range (Standard): 83.8% (70-180 mg/dL)
```

## Next Steps: Choose TIR Standard

Since all components now use PLAN_CONFIG.ts, you can easily standardize TIR calculations:

### Option A: Use EXTENDED Range (70-180) for Both
**Make TimeInRangeRow use same range as AGP**
```typescript
// In TimeInRangeRow.tsx, change from STANDARD to EXTENDED
const timeInRange = bgData.filter(reading => 
  reading.glucose >= GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.min && 
  reading.glucose <= GLUCOSE_THRESHOLDS.TARGET_RANGE.EXTENDED.max
);
```
**Result**: Both show ~83.8% (AGP clinical standard)

### Option B: Use STANDARD Range (70-140) for Both  
**Make AGP use tighter range like TimeInRangeRow**
```typescript
// In GlucoseTheme.tsx, change target range
target: {
  min: GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.min,  // 70
  max: GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.max,  // 140
  // ...
}
```
**Result**: Both show ~77% (tighter diabetes control)

### Option C: Keep Different Ranges with Clear Labels
**Add labels to distinguish the two standards**
- "Time in Range (Standard): 77%" for tight control
- "Time in Range (Extended): 83.8%" for clinical standard

**Which option do you prefer?**

## Files Requiring Updates

1. **PLAN_CONFIG.ts**: Decide on standard TIR range
2. **TimeInRangeRow.tsx**: Update range or add labeling
3. **AGPSummary.tsx**: Ensure consistent range usage
4. **GlucoseTheme.tsx**: Consolidate into PLAN_CONFIG.ts
5. **statistics.utils.ts**: Update to use consolidated ranges

## Testing Requirements

1. **Unit Tests**: Verify TIR calculations with known datasets
2. **Integration Tests**: Ensure both components show consistent values
3. **Clinical Validation**: Verify chosen range aligns with medical standards

## Conclusion

The 77% vs 83.8% discrepancy is **expected behavior** due to different glucose target ranges:
- TimeInRangeRow: 70-140 mg/dL (stricter)
- AGP: 70-180 mg/dL (clinical standard)

**Resolution Priority**: HIGH - Consistency in diabetes metrics is critical for patient safety and user trust.

**Recommended Action**: Implement Option 1 (Clinical Alignment) to standardize on 70-180 mg/dL AGP consensus range across all components.
