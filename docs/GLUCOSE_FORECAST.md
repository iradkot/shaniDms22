# Glucose forecasts

ShaniDms shows experimental, read-only forecasts on the live Day Graph and Android home-screen widgets. Forecasts do not change insulin delivery. Source research and upstream payload details are in [glucose-forecast-sources.md](research/glucose-forecast-sources.md).

## Forecast sources

| Source | Current implementation |
| --- | --- |
| Nightscout AR2 | Locally calculates Nightscout's log-glucose recurrence with coefficients −0.723 and 1.716, reference 140 mg/dL, and output bounds 36–400 mg/dL. Requires two valid readings approximately five minutes apart. |
| Loop | Imports `loop.predicted.values`, preserving `startDate`, five-minute spacing, and the separate Loop calculation timestamp. Selects the newest valid calculation, not the newest outer upload. It requires coverage of the requested 30-minute horizon. |
| Personal | Finds similar earlier situations for this Data Subject and averages their subsequent glucose changes, weighted by similarity. Requires a history spanning at least seven days and at least 20 matches across three day buckets; uses at most 40 matches. |
| Combined | Takes the arithmetic mean of the available sources when at least two exist. It has its own historical evaluation; it does not reuse another source's accuracy. |

The application creates six points at five-minute intervals, through 30 minutes **after the latest glucose reading**. The card states this anchor time; elapsed points disappear from the chart. Missing sources are shown as unavailable. Personal and Combined can appear before enough evidence exists to show accuracy percentages.

Loop already includes insulin and carbohydrate effects. ShaniDms does not apply another IOB/COB correction to its imported curve. Distant negative Loop projections do not invalidate otherwise valid near-term points. Invalid requested points still make that source unavailable.

## Personal context

Matching uses glucose, recent trend, change in trend, time of day, and weekday. Time features use the **viewing device's local clock**, not a separately configured Data Subject timezone.

Optional features include timestamped active insulin and carbohydrates, recorded meal carbohydrates, and time since recorded activity. Each optional feature needs a current value and at least 40 earlier examples containing that fact before it participates. Unknown values remain missing; missing insulin or carbohydrates are not zero. Negative net IOB is retained.

Journal context uses its latest edit time. A record edited after an earlier prediction origin cannot be used at that origin. There is no inferred kindergarten attendance, annual-season adjustment, or age correction. These require additional explicit context and validation.

## Historical accuracy and shaded ranges

Evaluation replays earlier prediction times in chronological order. Personal examples must have completed their 30-minute outcome before the replay origin. External status records cannot come from later uploads. Different personal feature sets and different Combined source combinations have separate evaluation keys.

The most recent seven days provide hourly replay origins. The earlier portion supplies interval calibration errors; the final three days evaluate them separately. Targets crossing that split are excluded. Percentages require at least 40 calibration origins and 30 evaluation origins across at least two day buckets.

- **Historical accuracy:** percentage of evaluated +30-minute predictions within **±20 mg/dL** of the observed value, with the number of checks.
- **Shaded range:** per-horizon bounds derived from the calibration errors' fifth and 95th percentiles, widened to contain the point prediction. Reported coverage measures the +30-minute interval on the separate evaluation period.

These are observed historical results, not a probability that the next reading will be correct, a guaranteed 90% interval, or clinical validation. Insufficient evidence produces an uncalibrated state without an invented percentage.

## Loading, scope, and freshness

The [shared loader](../src/modules/glucoseForecast/loader.ts) keeps history in its source-scoped instance:

1. Read the latest two hours of glucose and device status.
2. Load up to 28 days of glucose in four seven-day requests, with two requests in flight. Partial history remains usable; its span does not imply complete coverage.
3. After producing a snapshot, progressively load up to 14 days of older device status in two-hour requests, with two in flight. Newly loaded context participates on the next forecast refresh.
4. Reuse in-memory history. Historical refreshes have a six-hour interval; subsequent successful device-status refreshes fetch the uncovered tail with overlap. A forced refresh also reloads the four glucose-history chunks. Device-status history loading stops on a failed request instead of continuing a burst of failing requests.

A failed current glucose read rejects the forecast refresh. Failed current device status removes current Loop/IOB/COB context; it is not re-stamped as fresh. Glucose, source calculations, and active-load measurements have separate time checks. Predictions expire around 15 minutes, and future points alone remain visible. Source changes reset loader state and reject obsolete work. Browser caching stores only minimized forecast facts and their original timestamps.

## Android behavior

The app publishes the same forecast snapshot to Android. Native storage checks the active Nightscout account. Personal and Combined predictions depend on an app-generated snapshot and expire when its source data ages or a different glucose cycle arrives; Android does not retrain the personal model independently.

The native background path can refresh Nightscout AR2 and imported Loop predictions. Stale or mismatched snapshots are hidden. Widget summaries use the actual target time and remaining minutes rather than relabeling an old point as 30 minutes from now.

## Focused checks

From the repository root:

```sh
yarn jest __tests__/modules/glucoseForecast --runInBand
yarn jest __tests__/platform/nativeDayGraphDataSource.test.ts __tests__/platform/web/browserNightscoutClient.test.ts __tests__/platform/web/browserNightscoutDataSources.test.ts --runInBand
yarn jest __tests__/product/dayGraph/GlucoseForecast.test.tsx __tests__/androidGlucoseLiveSurface.test.ts --runInBand
yarn typecheck:rewrite
yarn typecheck:web
node scripts/run-android-gradle.mjs :app:testDebugUnitTest --tests com.shanidms22.glucose.WidgetForecastTest --tests com.shanidms22.glucose.WidgetForecastSchemaTest
```

The engine/loader regression suites cover chronological evaluation, timestamp selection, stale sources, source switching, incremental history loading, and Loop horizon validation. Adapter tests cover native/web delivery and minimized browser-cache round trips. Android tests cover snapshot decoding and expiration behavior.
