# Day graph maintenance

The product chart uses the application's selected theme. Native and web hosts
must provide `ThemeSettingsProvider` and the native styled-components
`ThemeProvider` (`AppThemeProvider` supplies this on web). Do not create a
chart-specific theme or read the mutable theme singleton from chart renderers.

## Where changes belong

- `src/style/theme.ts` defines chart series colors for every app theme. Use
  `getChartPalette(theme)` for chart surfaces, labels, grid and series. Glucose
  ranges retain the app's existing glucose color semantics.
- `src/product/dayGraph/DayGraphChartAdapter.ts` adapts the domain day model to
  shared chart inputs. It should not contain SVG or gesture handling.
- `RichDayGraphChart` owns product controls, remembered view settings and the
  fullscreen host. The same chart content is mounted once in either host.
- `StackedHomeCharts` aligns all lanes to one time domain and connects the
  inspector to the touch state. It is also used by the legacy screens.
- `MiniChartLane` owns lane layout, units, axes, selected-time cursor and empty
  state. `miniChartData` supplies domain calculations and data segmentation.
  Individual series components only draw their own data.
- `useStackedChartsTouchTooltip` owns pointer intent and selection lifetime.
  Keep the gesture origin stable. Vertical movement yields to page scrolling;
  horizontal movement inspects time. Child visuals must not intercept touches.

## Data rules

Native insulin data is loaded by `services/insulin/insulinDataSource.ts`.
`useInsulinData` is its React facade. Product adapters, legacy charts and AI
tools call the same `loadInsulinContext` service; they must not independently
fetch or normalize treatments, basal profiles, IOB or COB. Non-React tools
cannot call a React hook, so sharing happens below the hook.

The context accepts an inclusive start and exclusive end. It handles the
24-hour basal carry-in, historical profile selection, treatment normalization,
device-status decoding and per-resource availability. It shares pending work
and a bounded 60-second memory cache by account/source revision and exact
range. Explicit refresh bypasses that cache. Late responses from an earlier
source are rejected. `insulinRangeMetrics` owns delivery totals and the policy
for whether their source data is sufficiently complete.

Raw record readers (for example, journal links and profile history) use the
canonical API wrappers and `api/nightscoutRecords.ts` transport. Uncached
readers do not write generic offline storage. Failed or malformed responses
reject; they cannot masquerade as successful empty ranges. The native direct
connection and the web authenticated proxy remain platform boundaries.

Range reads also verify completeness. Nightscout v1 applies `count` without
`skip` paging ([server implementation](https://github.com/nightscout/cgm-remote-monitor/blob/15.0.0/lib/server/treatments.js)).
`nightscoutRangeRecords` increases the count for the same fixed range until the
response is unsaturated. Reaching the safety cap is an error, never a fresh
partial result. This matters for Loop's frequent temporary-basal records in
weekly AI summaries as well as high-frequency device status.

`activeLoadSamples` is a separate time series, not a byproduct of glucose
enrichment. A day with IOB/COB and no glucose still renders those facts. Battery
status alone is not a load reading. Partial load fields remain partial; total
IOB can be derived only when both basal and bolus components are known.

Optional timeline injection must never disable treatment, profile or device
status loading. The native chart derives its timeline from the shared context
and combines it with journal records.

Basal is a rate (`U/hr`), drawn as steps. The scheduled profile is dashed;
temporary delivery is solid. A recorded suspension is zero. An unknown profile
is missing data, not zero.

Bolus is an event dose (`U`), drawn as bars. Simultaneous doses remain separate
records and stack visibly. The selected event window is five minutes on either
side of the cursor in both the lane and inspector.

Active insulin (`U`) and active carbohydrates (`g`) use separate scales. Missing
fields and long sampling gaps split the line. Negative active insulin is kept.
Glucose readouts do not carry a reading across gaps longer than ten minutes.

Separate mode has one lane per series. Overlay mode shares one plot for basal,
IOB and COB, with independently labelled scales and units. Its bolus dose lane
remains separate. Both modes use the same selection, palette and factual
series. Stored `separate`/`mixed` preferences retain their existing values.

## Verification

Run `yarn verify:all` before release. Chart regression suites cover mobile
touch/scroll, missing data, dose selection, dynamic glucose bounds, theme
switching, compact lane heights and fullscreen state.

For browser interaction checks, start `yarn web --host 127.0.0.1`, then run
`node scripts/check-day-graph-mobile.cjs` with Playwright installed. Alternatively
set `PLAYWRIGHT_MODULE` to its installed module path and `PLAYWRIGHT_CHANNEL` to
an installed Chromium browser channel. The script uses synthetic data and
checks four widths and all four app themes. Screenshots go to ignored
`artifacts/chart-mobile/`. Browser emulation does not replace an Android device
smoke test.
