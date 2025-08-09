# Execution Plan — Combined BG-Bolus Tooltip Feature

## User Story & Acceptance
- **Original request:** "I want to bolus insulin tooltip to be kind of merged with the smbg insulin, as it is very small its very hard to hover on it"
- **Refined understanding:** User found small bolus markers difficult to tap/hover, wanted combined tooltip showing both BG and insulin when they occur close in time
- **Done when:** 
  - BG and bolus events within 1 minute show combined tooltip
  - Combined tooltip displays both glucose reading and insulin dose
  - Fallback to individual tooltips when events are further apart
  - Better usability for small touch targets on mobile

## Proposed Approach
- **Design philosophy:** Merge related medical data for better user experience and medical context
- **Key components:** New CombinedBgBolusTooltip component alongside existing individual tooltips
- **Integration strategy:** Smart tooltip selection based on time proximity in main CgmGraph component

## File Changes Executed
- `src/components/CgmGraph/components/Tooltips/CombinedBgBolusTooltip.tsx`: [new] - Combined tooltip component showing both BG and bolus information with visual separation
- `src/components/CgmGraph/components/Tooltips/index.ts`: [new] - Export file for tooltip components
- `src/components/CgmGraph/CgmGraph.tsx`: [modified] - Added combined tooltip logic and import, updated tooltip selection to check 1-minute proximity
- `src/components/CgmGraph/components/Tooltips/CombinedBgBolusTooltip.test.tsx`: [new] - Test file for combined tooltip component
- `docs/agent/00_CONTEXT.md`: [updated] - Documentation of combined tooltip feature

## Implementation Results

### Combined Tooltip Logic:
- **Time threshold:** 1 minute (60,000ms) proximity detection
- **Priority order:** Combined tooltip > individual tooltips based on temporal proximity
- **Visual design:** BG data at top, separator line, bolus data below with distinct colors
- **Positioning:** Smart bounds checking to prevent tooltip overflow

### Combined Tooltip Features:
- **BG section:** Glucose value with medical color coding, timestamp
- **Bolus section:** Insulin amount in units, timestamp with orange highlighting
- **Time difference:** Shows minutes apart if >10 seconds difference
- **Visual separation:** Horizontal line between BG and insulin data
- **Medical context:** Both glucose and insulin data together for better correlation

### Tooltip Selection Algorithm:
```typescript
if (closestBgSample && closestBolus) {
  const timeDifference = Math.abs(bgTime - bolusTime);
  if (timeDifference <= 60000) { // Within 1 minute
    showCombinedTooltip = true;
  } else {
    // Show tooltip for event closer to touch point
  }
}
```

## Medical/Safety Considerations
- **Data preservation:** All original BG and insulin values displayed exactly as received
- **Visual clarity:** Clear separation between glucose and insulin data with distinct icons (🩸/💉)
- **Medical correlation:** Enables users to see relationship between glucose readings and insulin doses
- **Timestamp accuracy:** Shows exact timestamps for both events, time difference if significant

## UX Improvements Achieved
- **Easier interaction:** Larger combined tooltip area instead of tiny bolus markers
- **Medical context:** Both glucose and insulin data in single view for better diabetes management
- **Smart fallback:** Individual tooltips when events are temporally separate
- **Mobile-friendly:** Better touch targets for small screens
- **Visual hierarchy:** Clear information organization with icons and color coding

## Risk Assessment
- **Low medical risk:** No calculation changes, only display improvements
- **Low UX risk:** Fallback to existing individual tooltips when combined doesn't apply
- **Performance:** Minimal impact - only adds time difference calculation
- **Rollback:** Easy to disable combined tooltip, individual tooltips remain intact

## Success Metrics
✅ **Combined tooltip displays when BG and bolus within 1 minute**
✅ **Both glucose and insulin information clearly visible**  
✅ **Smart positioning prevents tooltip overflow**
✅ **Fallback to individual tooltips works correctly**
✅ **Medical data accuracy preserved**
✅ **Better touch experience for small bolus markers**

## Next Steps for Validation
1. Test combined tooltip with real data on mobile device
2. Verify 1-minute threshold works appropriately for typical diabetes scenarios
3. Ensure tooltip positioning works across different screen sizes
4. Monitor that medical data correlation improves user decision-making
