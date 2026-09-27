# Android daily summary widget

The home-screen summary widget shows the current local day, from midnight to the
last summary update. The separate glucose graph widget keeps its selected graph
window.

- The large ring shows time in range, with red for below range, green for in
  range, and amber for above range. Percentages and labels also identify each
  segment without relying on color.
- Data coverage shows how much of the elapsed day has CGM readings. Missing
  readings are not counted as in range. Each reading covers at most five minutes.
- The insulin bar separates basal and bolus. The totals are estimates from the
  available Nightscout schedule and treatments.
- Tap the comparison to switch between yesterday and the previous seven days.
  Each comparison ends at the same local time of day as today's summary. The
  selection is saved separately for each widget.
- Increase the widget size to see the full comparison chart. Small widgets keep
  time in range visible.

Missing or unusable data shows a placeholder. A prior day's summary is never
relabeled as today. Historical comparisons are withheld when the available data
cannot support them.

## Verification

From `android`, run the native unit tests:

```powershell
.\gradlew.bat :app:testDebugUnitTest
```

With an Android emulator running, run the native rendering and interaction tests:

```powershell
.\gradlew.bat :app:connectedDebugAndroidTest -PreactNativeArchitectures=x86_64 -PTARGET_ABI=x86_64
```

`WidgetSummaryRenderingTest` renders the actual RemoteViews at several sizes,
including Hebrew, larger text, and missing-data states. It also saves PNGs for
visual inspection.
