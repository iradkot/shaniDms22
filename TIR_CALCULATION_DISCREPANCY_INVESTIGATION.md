# Time in Range (TIR) Calculation Discrepancy Investigation

## Problem Statement

User reported different Time in Range values displayed in different sections of the app:
- **Key Glucose Trends section**: 77%
- **AGP Analytics section**: 83.8%

This investigation analyzes the root cause of this discrepancy and provides recommendations for resolution.

## SOLUTION IMPLEMENTED ✅

**Status**: RESOLVED - Option B implemented, both components now use STANDARD range (70-140 mg/dL).

**Final Configuration**:
- **TimeInRangeRow**: Uses `TARGET_RANGE.STANDARD` (70-140 mg/dL) ✅
- **AGP Components**: Uses `TARGET_RANGE.STANDARD` (70-140 mg/dL) ✅
- **Single Source**: All glucose ranges reference PLAN_CONFIG.ts only ✅
- **No Hardcoded Values**: Everything uses PLAN_CONFIG constants ✅

**Result**: 
- **Both components now show consistent TIR values (~77%)**
- **Tighter diabetes control standard (70-140 mg/dL) applied across entire app**
- **Single source of truth maintained in PLAN_CONFIG.ts**

**Changes Made**:
1. Updated `GlucoseTheme.tsx` target range from EXTENDED (70-180) to STANDARD (70-140)
2. Updated high range to start at 141 instead of 181
3. Updated `getGlucoseRangeColor` function to use STANDARD range
4. All glucose calculations now reference PLAN_CONFIG.ts exclusively

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

## Files Updated

1. **PLAN_CONFIG.ts**: ✅ Single source of truth maintained
2. **TimeInRangeRow.tsx**: ✅ Already using TARGET_RANGE.STANDARD
3. **GlucoseTheme.tsx**: ✅ Updated to use TARGET_RANGE.STANDARD (70-140)
4. **AGP Pipeline**: ✅ Now uses consistent range via GlucoseTheme.tsx

## Testing Verification

Both Time in Range displays should now show:
- **Consistent percentage values** (~77% for same dataset)
- **Same target range** (70-140 mg/dL)
- **Tighter diabetes control standard** across entire application

## Conclusion

## Conclusion

The 77% vs 83.8% discrepancy is **expected behavior** due to different glucose target ranges:
- TimeInRangeRow: 70-140 mg/dL (stricter)
- AGP: 70-180 mg/dL (clinical standard)

**Resolution Priority**: HIGH - Consistency in diabetes metrics is critical for patient safety and user trust.

**Recommended Action**: Implement Option 1 (Clinical Alignment) to standardize on 70-180 mg/dL AGP consensus range across all components.
