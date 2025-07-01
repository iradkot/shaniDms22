# AGP (Ambulatory Glucose Profile) Graph Component

A comprehensive, medical-standard AGP implementation for React Native diabetes management applications, following clinical guidelines and featuring advanced glucose analytics.

## 🩺 Medical Overview

The Ambulatory Glucose Profile (AGP) is a clinical standard for visualizing glucose patterns from continuous glucose monitoring (CGM) data. It shows glucose percentiles (5th, 25th, 50th, 75th, 95th) across a standardized 24-hour period, helping healthcare providers and patients identify patterns and optimize diabetes management.

## 📊 Key Features

### Core AGP Visualization
- **Percentile Bands**: 5th-95th and 25th-75th percentile ranges
- **Median Line**: 50th percentile (median glucose)
- **Target Range Overlay**: Configurable glucose target zone
- **24-Hour Time Scale**: Standard midnight-to-midnight display
- **Smooth Interpolation**: Professional-grade curve smoothing

### Clinical Statistics
- **Time in Range (TIR)**: Percentage breakdown by glucose zones
- **Glucose Management Indicator (GMI)**: Estimated A1C equivalent
- **Coefficient of Variation (CV)**: Glucose variability measure
- **Average Glucose**: Mean glucose over the period
- **Clinical Insights**: Automated risk assessment and recommendations

### Advanced Features
- **Data Quality Assessment**: Automatic validation and quality scoring
- **Enhanced Mode**: Tabbed interface with detailed analytics
- **Compact Mode**: Space-efficient display for dashboards
- **Responsive Design**: Configurable dimensions and layouts
- **Clinical Color Coding**: Medical-standard glucose range colors

## 🏗️ Architecture

### Modular Design
```
AGPGraph/
├── components/           # UI Components
│   ├── AGPChart.tsx     # Main chart visualization
│   ├── AGPStatistics.tsx # Statistics display
│   └── AGPLegend.tsx    # Legend component
├── hooks/               # Custom Hooks
│   ├── useAGPData.ts    # Data processing
│   ├── useChartConfig.ts # Chart configuration
│   └── useAGPStats.ts   # Statistics processing
├── utils/               # Utility Functions
│   ├── percentile.utils.ts # Percentile calculations
│   ├── statistics.utils.ts # Clinical statistics
│   ├── validation.utils.ts # Data validation
│   └── constants.ts     # Medical constants
├── types/               # TypeScript Definitions
│   └── agp.types.ts     # All type definitions
├── styles/              # Styled Components
│   └── components.styles.ts # UI styling
├── AGPGraph.tsx         # Main component
├── EnhancedAGPGraph.tsx # Advanced component
└── index.ts             # Exports
```

## 🚀 Usage

### Basic Implementation
```tsx
import AGPGraph from 'app/components/AGPGraph';

<AGPGraph 
  bgData={bgSamples}
  width={350}
  height={250}
  showStatistics={true}
  showLegend={true}
/>
```

### Enhanced Mode
```tsx
import { EnhancedAGPGraph } from 'app/components/AGPGraph';

<EnhancedAGPGraph 
  bgData={bgSamples}
  width={350}
  height={250}
  showStatistics={true}
  showLegend={true}
  compactMode={false}
/>
```

### Compact Dashboard Mode
```tsx
<EnhancedAGPGraph 
  bgData={bgSamples}
  width={320}
  height={180}
  compactMode={true}
/>
```

### Custom Target Range
```tsx
<AGPGraph 
  bgData={bgSamples}
  targetRange={{ min: 80, max: 160 }}
/>
```

## 📋 Props Interface

### AGPGraphProps
```typescript
interface AGPGraphProps {
  bgData: BgSample[];              // Glucose readings
  width?: number;                  // Chart width (default: 350)
  height?: number;                 // Chart height (default: 250)
  showStatistics?: boolean;        // Show statistics panel
  showLegend?: boolean;            // Show legend
  targetRange?: {                  // Custom target range
    min: number; 
    max: number;
  };
}
```

### BgSample Data Format
```typescript
interface BgSample {
  sgv: number;                     // Glucose value (mg/dL)
  date: number;                    // Timestamp (ms)
  dateString: string;              // ISO date string
  trend: number;                   // Trend indicator
  direction: TrendDirectionString; // Trend direction
  device: string;                  // Device identifier
  type: string;                    // Sample type
}
```

## 🔧 Configuration

### Default Settings
```typescript
const AGP_DEFAULT_CONFIG = {
  intervalMinutes: 5,              // Time interval for calculations
  minReadingsPerInterval: 3,       // Minimum readings required
  smoothing: true,                 // Apply curve smoothing
  targetRange: { min: 70, max: 180 }, // Standard target range
  defaultWidth: 350,               // Default chart width
  defaultHeight: 250,              // Default chart height
  margin: {                        // Chart margins
    top: 20, right: 30, 
    bottom: 40, left: 60
  }
};
```

### Medical Constants
```typescript
const AGP_GLUCOSE_RANGES = {
  veryLow: { min: 0, max: 54, color: '#8B0000' },    // <54 mg/dL
  low: { min: 54, max: 69, color: '#FF4444' },       // 54-69 mg/dL
  target: { min: 70, max: 180, color: '#4CAF50' },   // 70-180 mg/dL
  high: { min: 181, max: 250, color: '#FFA726' },    // 181-250 mg/dL
  veryHigh: { min: 251, max: 999, color: '#FF5722' } // >250 mg/dL
};
```

## 📊 Clinical Calculations

### Time in Range (TIR)
Standard diabetes care percentages across glucose zones:
- **Very Low**: <54 mg/dL (hypoglycemia alert level)
- **Low**: 54-69 mg/dL (hypoglycemia threshold)
- **Target**: 70-180 mg/dL (recommended range)
- **High**: 181-250 mg/dL (hyperglycemia level 1)
- **Very High**: >250 mg/dL (hyperglycemia level 2)

### Glucose Management Indicator (GMI)
```
GMI = 3.31 + (0.02392 × mean glucose in mg/dL)
```

### Coefficient of Variation (CV)
```
CV = (standard deviation / mean glucose) × 100
```

### Estimated A1C
```
A1C = (mean glucose + 46.7) / 28.7
```

## 🔍 Data Quality Assessment

### Quality Levels
- **Excellent**: >200 readings/day, >80% coverage
- **Good**: >100 readings/day, >60% coverage  
- **Fair**: >50 readings/day, >40% coverage
- **Poor**: Below fair thresholds

### Validation Rules
- Minimum 10 data points required
- Glucose values: 20-600 mg/dL range
- Valid timestamps required
- Gap detection for missing periods

## 🎨 Styling & Theming

### Color Scheme
- **Medical Standard**: Follows clinical glucose range colors
- **Accessible**: High contrast for readability
- **Consistent**: Matches app design system
- **Professional**: Clinical-grade appearance

### Responsive Design
- **Configurable Dimensions**: Width/height props
- **Adaptive Layout**: Scales with container
- **Mobile Optimized**: Touch-friendly interface
- **Compact Mode**: Dashboard-friendly variant

## 🧪 Testing

### Test Data Generation
```tsx
import { SimpleAGPTest } from 'app/components/AGPGraph';

// Renders test AGP with sample data
<SimpleAGPTest />
```

### Sample Data
- 14 days of realistic glucose patterns
- Meal-time glucose spikes
- Circadian rhythm variations
- Random glucose variability

## 🔗 Integration

### With Trends Component
```tsx
// In TrendsMainContent.tsx
<Collapsable title="Ambulatory Glucose Profile (AGP)">
  <AGPGraph 
    bgData={bgData} 
    showStatistics={false}
    showLegend={false}
  />
</Collapsable>

<Collapsable title="Enhanced AGP Analysis">
  <EnhancedAGPGraph 
    bgData={bgData}
    showStatistics={true}
    showLegend={true}
  />
</Collapsable>
```

## 📚 Clinical Guidelines

This implementation follows:
- **International Consensus**: AGP standardized format
- **ADA Guidelines**: American Diabetes Association recommendations
- **ATTD Standards**: Advanced Technologies & Treatments for Diabetes
- **Clinical Best Practices**: Evidence-based glucose target ranges

## 🔄 Performance

### Optimizations
- **Memoized Calculations**: Prevents unnecessary recalculations
- **Efficient Rendering**: SVG-based charts for performance
- **Data Validation**: Fast validation with early returns
- **Memory Management**: Proper cleanup and garbage collection

### Scalability
- **Large Datasets**: Handles thousands of readings efficiently
- **Real-time Updates**: Supports dynamic data updates
- **Batch Processing**: Optimized for bulk data operations

## 🛠️ Development

### Adding New Metrics
1. Add metric calculation to `statistics.utils.ts`
2. Update `AGPStatistics` interface in types
3. Add display component in `AGPStatistics.tsx`
4. Include in clinical insights if applicable

### Customizing Visualization
1. Modify chart configuration in `useChartConfig.ts`
2. Update styling in `components.styles.ts`
3. Adjust constants in `constants.ts`
4. Test with various data scenarios

## 🐛 Troubleshooting

### Common Issues
- **No Data**: Check BgSample format and validation
- **Missing Chart**: Verify SVG component imports
- **Poor Quality**: Increase data coverage and readings
- **Performance**: Check data size and memoization

### Debug Mode
Enable detailed logging and validation messages:
```tsx
const { agpData, warnings, dataQuality } = useAGPData(bgData, { 
  debug: true 
});
```

## 📈 Future Enhancements

### Planned Features
- **Overlay Comparisons**: Compare multiple time periods
- **Interactive Tooltips**: Detailed hover information  
- **Export Functionality**: PDF/image export capabilities
- **Advanced Analytics**: Machine learning insights
- **Trend Prediction**: Glucose pattern forecasting

---

**Clinical Note**: This AGP implementation is designed for educational and monitoring purposes. Always consult healthcare providers for medical decisions and diabetes management changes.
