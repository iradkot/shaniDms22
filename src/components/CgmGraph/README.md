# cgmGraph

This folder contains components and utilities related to rendering a Continuous Glucose Monitoring (CGM) graph.

## Components

### CgmGraph

This component is the main entry point for rendering the CGM graph. It takes in the following props:

- `data`: An array of BG (blood glucose) samples.
- `foodItems`: An array of food items, each with a timestamp indicating when they were consumed.
- `width` (optional): The width of the graph in pixels. Defaults to 500.
- `height` (optional): The height of the graph in pixels. Defaults to 300.

### CGMSamplesRenderer

This component is responsible for rendering the BG samples on the graph. It uses the `GraphStyleContext` context to access the scales and data needed for rendering.

### GraphDateDisplay

This component is responsible for rendering the date labels on the X axis of the graph. It uses the `GraphStyleContext` context to access the scales and data needed for rendering.

### XGridAndAxis

This component is responsible for rendering the X grid and axis lines on the graph. It uses the `GraphStyleContext` context to access the scales and data needed for rendering.

### YGridAndAxis

This component is responsible for rendering the Y grid and axis lines on the graph. It takes in the `highestBgThreshold` prop, which indicates the maximum value for the Y axis. It also uses the `GraphStyleContext` context to access the graph dimensions needed for rendering.

### XTick

This component is responsible for rendering an individual X axis tick on the graph. It takes in the `x` prop, which is the x position of the tick, as well as optional props for rendering a date label and rounding the tick to the nearest hour.

### FoodItemsRenderer

This component is responsible for rendering the food items on the graph. It takes in the `foodItems` prop, an array of food items, and renders a `FoodItem` component for each item.

### FoodItem

This component is responsible for rendering an individual food item on the graph. It takes in the `foodItem` prop, which is the food item to render, as well as props for indicating whether the item is currently focused and for handling click events.

## Contexts

### GraphStyleContext

This context provides access to the scales and dimensions needed for rendering the graph components. It is consumed by many of the components in this folder.

## Utils

### xAccessor

This utility function is used to extract the X value from a BG sample.

### yAccessor

This utility function is used to extract the Y value from a BG sample.

### cgmRange

This constant defines the target range for CGM readings.

### getShownDays

This utility function is used to calculate the days that should be shown on the X axis of the graph.

### getTicksAmount

This utility function is used to calculate the number of ticks to show on the X axis of the graph.

### formatDateToLocaleDateString

This utility function formats a date object as a localized string.

### formatDateToLocaleTimeString

This utility function formats a date object as a localized time string.
