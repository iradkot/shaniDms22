# Custom Glucose Range Slider - Simplified Version

## 🎯 **Overview**
A simple, intuitive glucose range analysis component with **draggable knobs** that allows users to set custom blood glucose ranges and see real-time percentage calculations of time-in-range.

## ✨ **Features**
- **🎚️ Draggable Knobs**: Two moveable knobs for min/max range selection
- **📊 Real-time Percentage**: Shows percentage of time within selected range  
- **🩺 Medical Interpretations**: Provides clinical context for selected ranges
- **🎨 Theme Integration**: Fully integrated with app's theme system
- **📱 Touch-Friendly**: Optimized for mobile touch interactions
- **⚡ Performance**: Efficient calculations with large glucose datasets

## 🔧 **Usage**

### Basic Implementation
```tsx
import CustomGlucoseRangeSlider from 'app/components/CustomGlucoseRangeSlider/CustomGlucoseRangeSlider';

<CustomGlucoseRangeSlider
  bgData={bgData}
  onRangeChange={(min, max, percentage) => {
    console.log(`${percentage}% of time between ${min}-${max} mg/dL`);
  }}
/>
```

### With Custom Initial Values
```tsx
<CustomGlucoseRangeSlider
  bgData={bgData}
  initialMinValue={80}
  initialMaxValue={180}
  onRangeChange={(min, max, percentage) => {
    // Handle range changes
  }}
/>
```

### In Trends Screen (Current Integration)
```tsx
<Collapsable title="Custom Range Analysis">
  <CustomGlucoseRangeSlider
    bgData={bgData}
    onRangeChange={(min, max, percentage) => {
      console.log(`Custom Range: ${percentage}% of time between ${min}-${max} mg/dL`);
    }}
  />
</Collapsable>
```

## 📋 **Props**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `bgData` | `BgSample[]` | **Required** | Array of blood glucose readings |
| `onRangeChange` | `function` | `undefined` | Callback when range changes: `(min, max, percentage) => void` |
| `initialMinValue` | `number` | `70` | Initial minimum glucose value (mg/dL) |
| `initialMaxValue` | `number` | `180` | Initial maximum glucose value (mg/dL) |

## 🎚️ **Range Specifications**
- **Minimum Range**: 40 mg/dL (below severe hypoglycemia for extreme analysis)
- **Maximum Range**: 200 mg/dL (above hyperglycemia for practical analysis)  
- **Default Range**: 70-180 mg/dL (standard min to extended max)
- **Touch Target**: 24px knobs with proper hit areas
- **Based on Constants**: Uses PLAN_CONFIG.ts glucose thresholds for medical accuracy

## 🏥 **Medical Interpretations**
The component provides clinical context based on selected ranges:
- **"Normal Range"**: 70-140 mg/dL (standard target range)
- **"Wide Range"**: Ranges broader than normal targets
- **"Tight Range"**: Ranges narrower than normal targets  
- **"Hypoglycemia Risk"**: Ranges including values below 70 mg/dL
- **"Hyperglycemia Focus"**: Ranges including values above 180 mg/dL

## 🎨 **Visual Design**
- **Large Percentage Display**: 32px bold text showing percentage
- **Practical Range Track**: Visual glucose range from 40-200 mg/dL (based on medical constants)
- **Highlighted Range**: Selected range shown in theme color
- **Draggable Knobs**: Large, touch-friendly circular knobs with shadows
- **Real-time Feedback**: Percentage updates as you drag
- **Drop Shadow**: Professional card-like appearance

## 📊 **How It Works**
1. **Drag Left Knob**: Sets minimum glucose value (40-199 mg/dL)
2. **Drag Right Knob**: Sets maximum glucose value (41-200 mg/dL)  
3. **Real-time Calculation**: Component calculates percentage of readings within range
4. **Visual Feedback**: Track highlights selected range, percentage updates immediately
5. **Medical Context**: Shows clinical interpretation based on PLAN_CONFIG constants

## 📊 **Example Output**
When user drags knobs to 80-150 mg/dL range:
```
65%
Time in Range: 80 - 150 mg/dL
Good control with some elevated readings
```

## 🔧 **Integration**
Currently integrated in:
- **Trends Screen**: Under "Custom Range Analysis" collapsable section

To add to other screens:
```tsx
// Import the component
import CustomGlucoseRangeSlider from 'app/components/CustomGlucoseRangeSlider/CustomGlucoseRangeSlider';

// Use in your component
<CustomGlucoseRangeSlider bgData={your_bg_data} />
```

## ⚡ **Performance**
- Optimized for datasets with thousands of glucose readings
- Real-time calculations with minimal re-renders using PanResponder
- Efficient pan gesture handling
- Memoized clinical interpretations

## 🧪 **Testing**
Includes comprehensive tests for:
- Percentage calculation accuracy (70%, 60%, 100% test cases)
- Range boundary validation  
- Edge cases (empty data, extreme values)
- Full slider range (40-200 mg/dL) functionality
- Boundary testing (values at 40 and 200 mg/dL limits)

## 🎯 **User Experience**
1. **Visual**: See large percentage display immediately
2. **Interactive**: Drag left and right knobs to adjust range
3. **Informative**: Get clinical interpretation of selected range
4. **Responsive**: Real-time updates as you drag
5. **Accessible**: Large touch targets and clear visual feedback

## 🏥 **Medical Safety**
- Uses glucose thresholds from `PLAN_CONFIG.ts` for interpretations
- Range validation prevents invalid selections (min < max)
- Clinical interpretations based on established diabetes management guidelines
- Consistent with other app components for medical accuracy

## 🔧 **Technical Details**
- Built with React Native `PanResponder` for smooth dragging
- Uses `styled-components/native` for theming
- TypeScript interfaces for type safety
- Dimensions API for responsive sizing
- Drop shadow for visual depth
