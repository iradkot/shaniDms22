# Performance analysis: Home screen + charts

This document focuses on performance risks and opportunities on the Home screen and the CGM chart stack (including tooltip + touch behavior). It is intentionally detailed and calls out even “small” sources of churn (allocations, unstable identities, avoidable work in render, etc.) because those add up under frequent renders (polling, streaming BG, and especially touch-move).

## Scope

- Home screen sections and stat rows (BG stats, insulin stats, TIR).
- Home list rows (BG card list) and memoization boundaries.
- Chart stack, especially `src/components/charts/CgmGraph`.

Not in scope: backend/network performance (except where it drives re-render frequency).

## TL;DR (highest impact)

1. **Touch-move causes full React re-renders** via `TouchContext` state updates on every move; that cascades into recomputing selection/windowing and re-rendering a large SVG tree.
2. **Selection/windowing helpers do repeated filtering/parsing on every move** (bolus/carb utilities are $O(n)$ and allocate `Date` objects repeatedly).
3. **Prop identity churn defeats memoization** in the chart (mapping tooltip arrays into `focused*` props creates new arrays every render).
4. Several Home rows compute statistics directly in render (no memo), which can become noticeable if upstream renders are frequent.

If you do only one thing: keep touch tracking off the React render path (or at least throttle it to 1 update / frame), and pre-index events used for tooltip matching.

---

## Methodology

- Static code review of Home components and CGM chart internals.
- Identification of work happening per render vs per gesture frame.
- Micro-benchmark harness (Jest) for selection/windowing utilities.

For true device results, pair this with:
- RN “Perf Monitor” (FPS + JS FPS)
- Flipper / Hermes sampling profiler
- Instrumentation in app (e.g. `console.time`) around selection calls during touch.

---

## Home screen: perf-sensitive areas

### `StatsRow`

Observed pattern:
- Computes average/stddev and biggest rise/fall in render.
- If parent re-renders often (polling, snapshot updates, expanding/collapsing header), this work repeats.

Why it matters:
- These computations scale with `bgData.length` and are pure; they’re good candidates for memoization.

Recommendation:
- Wrap derived stats with `useMemo` keyed on a stable `bgData` identity (or on a cheaper key such as `bgData.length` + last sample timestamp).

### `TimeInRangeRow`

Observed pattern:
- Bucket calculation is memoized, but it triggers **five animations** after a `setTimeout(200)` whenever buckets change.

Risks:
- If `bgData` identity changes frequently (even when values don’t), buckets recompute and animations restart.
- Multiple `Animated.timing` calls can add JS-thread pressure.

Recommendation:
- Ensure `bgData` identity is stable where possible.
- Consider guarding animations: only restart when bucket percentages actually change.

### `InsulinStatsRow`

Observed pattern:
- Calls `computeInsulinStats` directly in render.
- Uses heavier UI nodes (gradient + circular progress).

Recommendation:
- Memoize `computeInsulinStats` results.
- Ensure props passed into heavy child components are stable (avoid inline object literals).

### `CgmRows` / `BgDataCard`

Good:
- `FlatList` is intentionally tuned (`windowSize`, batching, `getItemLayout`, `removeClippedSubviews`).
- `BgDataCard` is memoized with a custom comparator.

Risk:
- If `bgData` array identity changes frequently, row rendering can churn despite memoization.

---

## CGM chart internals (deep dive)

Primary file: `src/components/charts/CgmGraph/CgmGraph.tsx`

### Render pipeline overview

On each render, the chart:
- Computes touch-relative coordinates (`xTouchPosition`, `yTouchPosition`).
- Derives `touchTimeMs` from `xScale.invert()`.
- Selects:
  - closest BG sample (`findClosestBgSample`)
  - closest bolus (`findClosestBolus`)
  - closest carb event (`findClosestCarbEvent`)
  - tooltip window boluses (`findBolusEventsInTooltipWindow`)
  - tooltip window carbs (`findCarbEventsInTooltipWindow`)
- Renders a relatively large SVG subtree (axes, grids, samples, markers, tooltips).

This becomes expensive specifically when **touch move triggers React state updates**, because touch move can happen ~60 times/sec.

### Touch handling (`TouchContext` / `useTouchHandler`)

Files:
- `src/components/charts/CgmGraph/contextStores/TouchContext.tsx`
- `src/components/charts/CgmGraph/hooks/useTouchHandler.ts`

Observed:
- `handleTouchMove` calls `setTouchPosition` directly.
- That updates React state on each touch event, forcing a re-render of all consumers.

Impact:
- This is a common “JS FPS drop” pattern in RN: a fast gesture drives React re-renders + allocations.

Recommendations (in increasing ambition):
1. **Throttle to one update per animation frame** (via `requestAnimationFrame`) to cap update rate.
2. Keep mutable touch position in a `useRef`, and only “commit” to state when crossing meaningful thresholds.
3. For best results, move gesture tracking to `react-native-gesture-handler` + `react-native-reanimated` shared values (keeps the hot path off the JS/React render loop).

### Graph style context (`GraphStyleContext`)

File: `src/components/charts/CgmGraph/contextStores/GraphStyleContext.ts`

Observed:
- `useGraphStyleContext(...)` runs whenever `CgmGraph` renders (including during touch-move renders).
- Scales (`xScale`, `yScale`) and `graphStyleContextValue` are recreated whenever the hook renders.
- `d3.extent(bgSamples, ...)` runs during hook render.

Impact:
- **Important:** because touch-move currently drives React re-renders, this means **new scale objects + new context values can be created at gesture frequency**, which forces all `GraphStyleContext` consumers (axes, renderers, tooltips) to re-render.

Recommendation:
- Memoize derived values inside `useGraphStyleContext` (`xExtent`, `xScale`, `yScale`, `graphStyleContextValue`) so the context value stays referentially stable when width/height/bgSamples/xDomain/margin are unchanged.
- Consider making the Provider value stable (avoid creating a new array/tuple each render) once the object is memoized.

### Selection utilities

#### BG selection (`findClosestBgSample`)

File: `src/components/charts/CgmGraph/utils.ts`

Good:
- Uses binary search ($O(\log n)$).

Perf issue:
- BG sample timestamps are already in ms (`BgSample.date`), but the function repeatedly does `new Date(...).getTime()`.

Recommendation:
- Use `bgSamples[mid].date` directly to avoid `Date` allocations.

#### Bolus/carb selection + windowing

Files:
- `src/components/charts/CgmGraph/utils/bolusUtils.ts`
- `src/components/charts/CgmGraph/utils/carbsUtils.ts`

Observed:
- Each call filters the entire array (`filter(isValid...)`), then loops, then (in windowing) maps/sorts/slices.
- These functions are called during touch-move renders.

Impact:
- $O(n)$ work per touch update.
- Avoidable allocations: `new Date(b.timestamp)` per element in several places.

Recommendation:
- Precompute “indexed” arrays once per data refresh:
  - `validBoluses: Array<{t: number, entry: ...}>` sorted by `t`
  - `validCarbs: Array<{t: number, entry: ...}>` sorted by `t`
- Then use binary search + narrow slice to find closest/window events.

Additional note:

- In `CgmGraph.tsx`, `tooltipBolusEvents` is computed inline (not memoized). If the windowing function is non-trivial, memoizing it by `[anchorTimeMs, insulinData, isTouchActive]` helps reduce repeated work during re-renders.

### Prop identity churn (subtle but real)

In `CgmGraph.tsx`:
- `focusedFoodItemIds={tooltipCarbEvents.map(c => c.id)}`
- `focusedBolusTimestamps={tooltipBolusEvents.map(b => b.timestamp)}`

Each render creates **new arrays**, even if `tooltipCarbEvents` and `tooltipBolusEvents` didn’t change.

Impact:
- Breaks memoization in children that depend on array identity (e.g. `FoodItemsRenderer` builds a `Set` from the focused IDs; it redoes that work every render).

Recommendation:
- Memoize the mapped arrays with `useMemo`, or change children to accept events directly instead of derived arrays.

### SVG node count and per-render work

- `CGMSamplesRenderer` maps every BG sample into a `<Circle>` each render.
- `XGridAndAxis` renders several tick lines and labels.
- `YGridAndAxis` renders multiple gridlines and labels.

This is typically fine for ~288 points, but becomes noticeable when re-rendered at gesture frequency.

### `CGMSamplesRenderer` animation

File: `src/components/charts/CgmGraph/components/CGMSamplesRenderer.tsx`

Observed:
- Starts an `Animated.loop` on focus change.
- The animated value is not wired to an actual `AnimatedCircle` in the current code path (only a normal `<Circle>` is rendered).
- `useNativeDriver: true` generally does **not** apply to `react-native-svg` props.

Impact:
- Best case: wasted setup work.
- Worst case: warnings and unnecessary JS-thread work.

Recommendation:
- Either wire the animation properly (if you need it) using supported primitives, or remove it.

### Axes / ticks

- `XGridAndAxis` computes ticks based on duration and evenly spaces them.
- `XTick` uses `xScale.invert`, `subMinutes`, and date formatting per tick.

Not huge by itself, but keep in mind these run per render.

---

## Micro-benchmarks (selection + tooltip windowing)

Harness:
- `__tests__/perf/cgmSelection.perf.test.ts`
- Run: `yarn perf:cgm-selection`

This benchmark prints timings to the Jest output. It is **not** a strict perf gate (no “must be under X ms” assertions) because those are flaky across machines.

### Results

(Results will vary by machine and build type. The numbers below are from running `yarn perf:cgm-selection` in this repo with:

- BG samples: 288 (5-min cadence)
- Boluses: 250
- Carb events: 120
- Touch sweep iterations: 750

Observed timings (lower is better):

- `findClosestBgSample (touch sweep)`: 2.97ms
- `findClosestBolus (touch sweep)`: 129.47ms
- `findClosestCarbEvent (touch sweep)`: 35.74ms
- `findBolusEventsInTooltipWindow (anchored)`: 133.58ms
- `findCarbEventsInTooltipWindow (anchored)`: 36.17ms

Interpretation:

- BG lookup is cheap (binary search), but bolus/carb selection and windowing are comparatively expensive because they filter/scan and parse timestamps on every call.
- Under a real touch-move path (potentially ~60 updates/sec), the bolus/windowing path is a prime candidate for indexing/binary-search optimization.

---

## Recommended fixes (prioritized)

### P0 (highest impact)

- Throttle or move touch tracking off React state (`TouchContext`).
- Pre-index bolus/carb events on data refresh; use binary search for closest/window.
- Fix prop identity churn (`focused*` arrays) to avoid repeated Set building / child re-renders.

### P1

- Memoize heavy derived stats in Home rows (`StatsRow`, `InsulinStatsRow`).
- Memoize D3 scale construction in `useGraphStyleContext`.

### P2

- Clean up unused/dead chart code paths (`FoodItem.tsx`, unused imports/animations).

---

## How to validate improvements

- With touch held down and moving on the chart:
  - JS FPS should stay high.
  - Tooltip should remain responsive (no “lagging cursor”).
- Use the benchmark to compare selection/windowing costs before/after.
- Confirm no regression in tooltip behavior (single vs multi-bolus, carbs display).
