# AGP Chart Centering Solution - Implementation

## Problem Analysis ✅

The AGP chart appeared off-center due to asymmetrical margins needed for Y-axis labels.

### Layout Hierarchy:
1. **TrendsMainContent**: `chartWidth = screenWidth - 10` (~380px)
2. **Wrapper View**: `paddingHorizontal: 5` + `alignItems: 'center'`
3. **ChartContainer**: `padding: 12px 8px`
4. **AGPChart SVG**: Full width with internal margins
5. **Chart margins**: `left: 70px` (Y-axis labels) vs `right: 15px`

### Mathematical Analysis:
- **Left margin**: 70px (needed for glucose value labels)
- **Right margin**: 15px (minimal padding)
- **Asymmetry**: 70 - 15 = 55px difference
- **Visual offset**: Chart content appears 27.5px off-center to the right

## Solution Implemented ✅

### **Approach**: Container-level compensation
Instead of modifying the chart's internal margins (which would affect Y-axis label positioning), apply a compensating offset at the container level.

### **Implementation**:
```tsx
// TrendsMainContent.tsx - Both AGP sections
<View style={{ 
  alignItems: 'center', 
  paddingHorizontal: 5,
  marginLeft: -25  // Compensate for chart's asymmetrical margins
}}>
```

### **Calculation**:
- **Theoretical offset**: -(70-15)/2 = -27.5px
- **Applied offset**: -25px (rounded for clean styling)
- **Result**: Chart content appears visually centered

## Technical Details

### **Why -25px instead of -27.5px?**
1. **Container padding**: The wrapper already has `paddingHorizontal: 5`
2. **ChartContainer padding**: Additional `padding: 12px 8px`
3. **Visual balance**: -25px provides better visual centering considering all container paddings

### **Why container-level vs chart-level?**
1. **Preserves Y-axis labels**: Chart margins remain optimal for label visibility
2. **Isolated solution**: Only affects the specific chart containers
3. **No SVG clipping**: Y-axis labels (positioned at x={-25}) remain fully visible
4. **Maintains responsiveness**: Works across different screen sizes

### **Applied to both sections**:
- ✅ **Ambulatory Glucose Profile (AGP)**: Basic chart
- ✅ **Enhanced AGP Analysis**: Chart with statistics

## Debugging Added

### **AGPChart.tsx**:
```typescript
const marginDifference = margin.left - margin.right;
const centeringOffset = -Math.round(marginDifference / 2);
console.log('[AGPChart] Centering calculation:', {
  width,
  leftMargin: margin.left,
  rightMargin: margin.right,
  marginDifference,
  centeringOffset,
  actualChartWidth: chartWidth
});
```

### **ChartAxes.tsx**:
```typescript
console.log(`[ChartAxes] Y-label ${glucose}: yPos=${yPos}, chartHeight=${chartHeight}`);
```

## Expected Result

The AGP chart should now appear visually centered with:
- ✅ **Y-axis labels** clearly visible on the left (70px margin preserved)
- ✅ **Chart content** appearing centered within the available space
- ✅ **Professional layout** with balanced visual weight
- ✅ **Responsive design** working across screen sizes

## Verification Steps

1. **Visual Check**: Chart content should appear centered horizontally
2. **Y-axis Labels**: Glucose values (40, 70, 100, 140, 180, 250, 300) should be clearly visible
3. **Console Logs**: Check centering calculations in browser/debugger console
4. **Responsive Test**: Verify centering on different screen sizes

The solution maintains all technical requirements while achieving proper visual centering.
