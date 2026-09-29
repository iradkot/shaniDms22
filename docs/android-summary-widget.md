# Android daily summary widget

The home-screen summary widget shows the current local day, from midnight to the
last summary update. The separate glucose graph widget keeps its selected graph
window.

- The large ring shows time in range, with red for below range, green for in
  range, and amber for above range. Percentages and labels also identify each
  segment without relying on color.
- Data coverage shows how much of the elapsed day has CGM readings. Missing
  readings are not counted as in range. Each reading covers at most five minutes.
- Complete recorded insulin uses a basal/bolus ratio bar. Partial insulin retains
  known amounts and labels basal time coverage; it never fills a schedule estimate.
- Tap the comparison to switch between yesterday and the previous seven days.
  Each comparison ends at the same local time of day as today's summary. The
  selection is saved separately for each widget.
- Increase the widget size to see the full comparison chart. Small widgets keep
  time in range visible.

Missing or unusable data shows a placeholder. A prior day's summary is never
relabeled as today. Historical comparisons are withheld when the available data
cannot support them.

## Data refresh

Foreground snapshot loading does not clear the native daily cache. Account
replacement and logout still clear it through the native sync configuration.
Foreground glucose updates and threshold changes request a missing/stale daily
summary, throttled to one attempt per minute for the same source and thresholds.

CGM is published before optional insulin requests. Today's insulin is calculated
independently of historical profiles and is published before comparison history.
Nightscout v1 history uses bounded increasing `count` requests because its list
endpoints do not apply `skip`. A saturated bound stays unknown rather than being
shown as a complete total.

The in-app Daily Overview uses the same visual hierarchy: time in range, then
basal/bolus and selectable previous-day/seven-day comparisons. Saved card orders
are respected. Current-day insulin stops at a captured cutoff; comparisons use
the same local clock time. Only explicit delivered basal amounts establish recorded
basal; a rate and duration alone do not. See [data access](DATA_ACCESS.md) and the
[daily data contract](DAILY_SUMMARY_DATA.md) before adding another calculator.

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

`WidgetDailySyncIntegrationTest` exercises the real sync, isolated Android
preferences and launcher renderer with synthetic Nightscout responses, including
optional endpoint failures and an account replacement during a request.
`WidgetDailyFetchingTest` covers the Nightscout v1 history contract, progressive
publication and independent availability of current and historical insulin.
