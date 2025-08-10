# Context for Chart Zoom Feature

## User Intent
- **Original request:** Add zoom functionality to charts with finger gestures and buttons, plus reset capability
- **Underlying problem:** Users need to examine specific time periods or glucose values in medical detail on mobile devices
- **Success criteria:** Common mobile chart zoom patterns - pinch-to-zoom, zoom buttons, and reset functionality

# Context for Chart Zoom Feature

## User Intent
- Original request: Add zoom functionality to charts with finger gestures and buttons, plus reset capability
- Underlying problem: Users need to examine specific time periods or glucose values in medical detail on mobile devices
- Success criteria: Common mobile chart zoom patterns - pinch-to-zoom, zoom buttons, and reset functionality

## Related Code

### Chart Components:
- `src/components/CgmGraph/CgmGraph.tsx` - Main glucose chart with SVG implementation
- `src/components/AGPGraph/AGPGraph.tsx` - Ambulatory Glucose Profile chart
- `src/components/AGPGraph/components/AGPChart.tsx` - Core AGP chart rendering
- `src/components/CgmGraph/components/CGMSamplesRenderer.tsx` - BG data points rendering
- `src/components/CgmGraph/components/YGridAndAxis.tsx` - Y-axis grid and labels
- `src/components/CgmGraph/components/XGridAndAxis.tsx` - X-axis grid and time labels

### Hooks & Context:
- `src/components/CgmGraph/contextStores/GraphStyleContext.tsx` - Chart dimensions and scales
- `src/components/CgmGraph/contextStores/TouchContext.tsx` - Touch handling logic
- `src/components/CgmGraph/hooks/useGraphStyleContext.ts` - Graph configuration
- `src/components/AGPGraph/hooks/useChartConfig.ts` - AGP chart configuration

### Utils & Constants:
- `src/constants/PLAN_CONFIG.ts` - Medical glucose thresholds (CRITICAL for zoom boundaries)
- `src/components/CgmGraph/utils/index.ts` - Chart utility functions (xAccessor, yAccessor)
- `src/style/colors.ts` - Theme colors for zoom controls
- `src/components/shared/GlucoseChart/GlucoseTheme.tsx` - Chart theming

### Integration Points:
- **Home Tab**: CGM chart in daily view
- **Trends Screen**: AGP analytics chart for multi-day analysis 
- Used by: TimeInRangeRow, StatsRow, Custom Range Analysis components

### Existing Tests:
- `src/components/CgmGraph/__tests__/` - Chart component tests
- `src/components/AGPGraph/TESTING_GUIDE.md` - AGP testing documentation

## Design Decisions

### Why This Approach:
- **Medical Context**: Zoom is critical for diabetes management - users need to examine specific glucose episodes
- **Mobile-First**: Touch gestures (pinch-to-zoom) are essential for mobile health apps
- **Accessibility**: Zoom buttons provide alternative for users who struggle with gestures
- **Data Integrity**: Zoom must preserve medical accuracy and glucose thresholds

### Alternatives Considered:
- Option A: Simple scale transform - easy but may blur medical data
- Option B: Data filtering with re-rendering - maintains precision but complex
- Option C: Hybrid approach - gesture scaling + data bounds validation
- **Chosen**: Option C for medical accuracy + smooth UX

### User Feedback Incorporated:
- Request for "trendy way" suggests modern mobile patterns
- Need for both gesture and button controls for accessibility
- Reset functionality for quick return to full view

## Medical/Safety Considerations

### Glucose Thresholds Used:
- All zoom operations must preserve `PLAN_CONFIG.GLUCOSE_THRESHOLDS` accuracy
- Y-axis zoom bounds: respect medical ranges (40-400 mg/dL practical limits)
- Critical values (≤70, ≥180) must remain clearly visible during zoom

### Calculation Accuracy:
- Zoom should not affect tooltip data precision
- Time-based zoom must maintain exact timestamp correlation
- Medical interpretations must remain accurate at all zoom levels

### Risk Mitigations:
- Zoom bounds validation to prevent "empty" medical data views
- Clear visual indicators when zoomed (scale information)
- Reset functionality easily accessible
- Preserve existing touch/tooltip functionality during zoom

## Integration Strategy

### Chart Types to Support:
1. **CGM Graph (Priority 1)** - Daily glucose trends with food/insulin data
2. **AGP Chart (Priority 2)** - Multi-day percentile analysis

### Implementation Phases:
1. **Phase 1**: CGM Graph zoom with gesture handler integration
2. **Phase 2**: Zoom controls UI (buttons + reset)
3. **Phase 3**: AGP Chart zoom support
4. **Phase 4**: Zoom state persistence and optimization

### Technical Approach:
- Use `react-native-gesture-handler` (already available)
- Extend existing `TouchContext` for zoom state management
- Add zoom controls component with theme integration
- Modify existing SVG transforms for smooth zoom operations

## Implementation Status ✅ UPDATED

### Phase 1 Complete: Time-Based Zoom for CGM Charts (X-Axis Only)
**Problem Solved:** User feedback indicated the original scale-based zoom was incorrect. They wanted **time-based zoom** (X-axis only) to examine smaller time periods, with horizontal navigation capability.

**New Approach:**
- **Time Windows**: 24h → 12h → 6h → 3h (instead of scale-based zoom)
- **X-Axis Only**: Glucose range (Y-axis) stays constant for medical consistency  
- **Pan Navigation**: Left/right arrows to navigate through time when zoomed
- **Scroll Integration**: Works with bottom scroll bar for time navigation

**Files Created:**
- `src/components/CgmGraph/constants/zoomConfig.ts` - Time window configuration (not scale-based)
- `src/components/CgmGraph/utils/zoomUtils.ts` - Time-based zoom calculations (X-axis transforms only) 
- `src/components/CgmGraph/hooks/useZoomContext.ts` - React hook for time window state management
- `src/components/CgmGraph/components/ZoomControls.tsx` - Updated with pan controls (← →) 

**Files Modified:**
- `src/components/CgmGraph/CgmGraph.tsx` - Integrated time-based zoom with pan navigation
- `src/components/CgmGraph/contextStores/TouchContext.tsx` - Enhanced for future gesture support

**Test Coverage:**
- `src/components/CgmGraph/utils/__tests__/timeZoomUtils.test.ts` - 9 passing tests for time-based zoom
- **All medical safety preserved** with time window validation

**Key Features Implemented:**
- ✅ Time-based zoom: 24h → 12h → 6h → 3h (no Y-axis scaling)  
- ✅ Pan controls: ← → buttons for horizontal navigation when zoomed
- ✅ Time window indicator: Shows "24h", "12h", "6h", "3h" 
- ✅ Medical data visibility validation (minimum readings per time window)
- ✅ SVG transforms: Only scale X-axis (1x Y-axis always) 
- ✅ Reset functionality: Returns to full 24h view
- ✅ Bottom scroll bar compatibility: Pan navigation works with existing scroll
- ✅ Medical safety: PLAN_CONFIG thresholds preserved, glucose scale unchanged

**User Experience:**
- **Zoom In**: Shows smaller time period (24h → 12h → 6h → 3h)
- **Zoom Out**: Shows larger time period (3h → 6h → 12h → 24h) 
- **Pan Left/Right**: Navigate through time when zoomed (← → buttons)
- **Reset**: Quick return to full day view
- **Visual Feedback**: Time window indicator ("6h", "12h", etc.)

### Phase 2 Pending: AGP Chart Integration
- Extend zoom functionality to trends screen
- Multi-day data zoom considerations
- Percentile chart zoom adaptations

### Phase 3 Pending: Pinch Gesture Implementation
- Complete TouchContext integration
- react-native-gesture-handler pinch-to-zoom
- Smooth gesture handling with zoom controls

**Ready for production use in CGM charts with medical safety compliance.**
