# AGP Chart Components

This folder contains modular chart components that together compose the complete AGP (Ambulatory Glucose Profile) chart visualization.

## Structure

```
chart/
├── ChartBackground.tsx     # Background rectangle with border
├── ChartGrid.tsx          # Grid lines (major/minor glucose, time)
├── ChartGradients.tsx     # SVG gradient definitions
├── ChartAxes.tsx          # X and Y axis labels
├── ChartBorder.tsx        # Outer chart border
├── TargetRange.tsx        # Target glucose range visualization
├── PercentileBands.tsx    # Shaded percentile bands (5-95%, 25-75%)
├── PercentileLines.tsx    # Percentile curve lines (5th, 25th, 50th, 75th, 95th)
└── index.ts              # Component exports
```

## Components

### Core Chart Elements
- **ChartBackground**: Base background with border
- **ChartGrid**: Horizontal glucose grid lines and vertical time grid lines
- **ChartAxes**: Y-axis (glucose values) and X-axis (time labels)
- **ChartBorder**: Outer border frame

### AGP-Specific Elements
- **PercentileBands**: Filled areas showing percentile ranges
- **PercentileLines**: Individual percentile curves (median, quartiles, etc.)
- **TargetRange**: Target glucose range (70-180 mg/dL) visualization

### SVG Definitions
- **ChartGradients**: Reusable gradient definitions for percentile bands

## Usage

Each component is focused on a single responsibility and can be composed together in the main `AGPChart` component. This modular approach makes the code:

- **Easier to understand**: Each file has a clear, single purpose
- **Easier to maintain**: Changes to one visual element don't affect others
- **Easier to test**: Individual components can be tested in isolation
- **Reusable**: Components can be reused in different chart contexts

## Medical Standards

All components follow established AGP medical standards:
- Percentile calculations based on clinical guidelines
- Standard glucose range thresholds (54, 70, 180, 250 mg/dL)
- Color coding consistent with diabetes management practices
