# Custom Glucose Range Slider

A React Native component for analyzing blood glucose data within custom ranges. This component allows users to set their own glucose range limits and see what percentage of time their glucose was within those bounds.

## Features

- **Custom Range Selection**: Set minimum and maximum glucose values using preset buttons
- **Real-time Percentage Calculation**: Automatically calculates and displays the percentage of time in the custom range
- **Medical Safety**: Uses established glucose thresholds from `PLAN_CONFIG.ts`
- **Theme Integration**: Follows the app's theme system for consistent styling
- **TypeScript Support**: Full TypeScript support with proper interfaces
- **Accessibility**: Proper labeling and navigation support

## Installation & Usage

### Import the Component

```tsx
import CustomGlucoseRangeSlider from 'app/components/CustomGlucoseRangeSlider';
```

### Basic Usage

```tsx
const [bgData, setBgData] = useState<BgSample[]>([]);

const handleRangeChange = (minValue: number, maxValue: number, percentage: number) => {
  console.log(`Range: ${minValue}-${maxValue} mg/dL, ${percentage}% time in range`);
  // Handle the range change (e.g., update state, send analytics, etc.)
};

return (
  <CustomGlucoseRangeSlider
    bgData={bgData}
    onRangeChange={handleRangeChange}
  />
);
```

### Advanced Usage with Custom Props

```tsx
<CustomGlucoseRangeSlider
  bgData={bgData}
  onRangeChange={handleRangeChange}
  initialMinValue={80}
  initialMaxValue={160}
  minLimit={50}
  maxLimit={300}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `bgData` | `BgSample[]` | **Required** | Array of blood glucose samples |
| `onRangeChange` | `(min: number, max: number, percentage: number) => void` | `undefined` | Callback fired when range values change |
| `initialMinValue` | `number` | `70` | Initial minimum glucose value (from GLUCOSE_THRESHOLDS.TARGET_RANGE.STANDARD.min) |
| `initialMaxValue` | `number` | `180` | Initial maximum glucose value (from GLUCOSE_THRESHOLDS.HYPER) |
| `minLimit` | `number` | `60` | Minimum allowed glucose value (from GLUCOSE_THRESHOLDS.SEVERE_HYPO) |
| `maxLimit` | `number` | `250` | Maximum allowed glucose value (from GLUCOSE_THRESHOLDS.SEVERE_HYPER) |

## Data Requirements

### BgSample Interface

The component expects blood glucose data in the following format:

```typescript
interface BgSample {
  sgv: number;           // Blood glucose value in mg/dL
  date: number;          // Timestamp in milliseconds  
  dateString: string;    // ISO date string
  trend: number;         // Trend indicator
  direction: TrendDirectionString; // Trend direction
  device: string;        // Device identifier
  type: string;          // Sample type
}
```

## Integration Examples

### With Collapsible Section

```tsx
import Collapsable from 'app/components/Collapsable';

<Collapsable title={'Custom Range Analysis'}>
  <CustomGlucoseRangeSlider
    bgData={bgData}
    onRangeChange={handleRangeChange}
  />
</Collapsable>
```

### With State Management

```tsx
const [customRange, setCustomRange] = useState({ min: 70, max: 180, percentage: 0 });

const handleRangeChange = (minValue: number, maxValue: number, percentage: number) => {
  setCustomRange({ min: minValue, max: maxValue, percentage });
  
  // Optional: Store in async storage for persistence
  AsyncStorage.setItem('customGlucoseRange', JSON.stringify({ min: minValue, max: maxValue }));
};
```

### With Analytics Tracking

```tsx
const handleRangeChange = (minValue: number, maxValue: number, percentage: number) => {
  // Track usage analytics
  analytics.track('custom_range_changed', {
    min_value: minValue,
    max_value: maxValue,
    percentage: percentage,
    date: new Date().toISOString()
  });
};
```

## Styling & Theming

The component automatically adapts to your app's theme system:

- `theme.inRangeColor` - Color for selected values and percentage display
- `theme.backgroundColor` - Component background color
- `theme.textColor` - Text color for labels and values
- `theme.borderColor` - Border colors for value displays
- `theme.borderRadius` - Consistent border radius

## Medical Accuracy

The component follows medical best practices:

- Uses `GLUCOSE_THRESHOLDS` from `PLAN_CONFIG.ts` as single source of truth
- Rounds percentages using `Math.round()` for consistency
- Validates range constraints (min < max)
- Provides medically relevant glucose value presets (50-300 mg/dL in 5-10 mg/dL increments)

## Performance Considerations

- Uses `useCallback` for event handlers to prevent unnecessary re-renders
- Memoizes calculations with `useMemo` when dealing with large datasets
- Filters value buttons efficiently to show only relevant options
- Optimized for datasets with thousands of blood glucose readings

## Accessibility

- Proper labeling for screen readers
- Touch targets meet accessibility guidelines (minimum 44pt)
- Clear visual feedback for selected values
- High contrast color combinations

## Error Handling

The component gracefully handles:
- Empty or invalid bgData arrays
- Missing glucose values
- Invalid range selections
- Theme property fallbacks

## Testing

Example test cases:

```tsx
describe('CustomGlucoseRangeSlider', () => {
  const mockBgData = [
    { sgv: 80, date: Date.now(), /* ... other props */ },
    { sgv: 120, date: Date.now(), /* ... other props */ },
    { sgv: 200, date: Date.now(), /* ... other props */ },
  ];

  it('calculates percentage correctly', () => {
    const { result } = renderHook(() => calculateCustomRangePercentage(mockBgData, 70, 140));
    expect(result.current).toBe(67); // 2 out of 3 values in range
  });
});
```

## Contributing

When modifying this component:

1. **Maintain medical accuracy** - Always use `GLUCOSE_THRESHOLDS` constants
2. **Follow theme system** - Use theme properties for all styling
3. **Test with real data** - Validate with actual blood glucose datasets
4. **Update documentation** - Keep this README current with any changes
5. **Consider performance** - Test with large datasets (1000+ readings)

## Related Components

- `TimeInRangeRow` - Standard TIR display with fixed ranges
- `StatsRow` - Comprehensive blood glucose statistics
- `BgGraph` - Visual glucose trends chart
- `Collapsable` - Expandable section wrapper
