# Daily summary data

The in-app Daily Overview and Android summary widget show recorded insulin.
Neither fills missing basal intervals from a programmed profile.

## Entry points

- `src/services/insulin/recordedInsulin.ts`: pure treatment-to-summary calculation.
- `src/services/insulin/recordedInsulinDataSource.ts`: one fresh, account-scoped
  treatment snapshot reused for the selected day and its seven comparison days.
- `src/modules/dailyOverview/domain`: local calendar windows and comparisons.
- `src/product/dailyOverview`: range, insulin, comparison and period components.
- `android/.../glucose/WidgetDailySummary.kt`: independent native background sync.
- `android/.../glucose/GlucoseWidgetInsulinData.kt`: native recorded-dose adapter.

The widget must refresh when JavaScript is suspended. Its native adapter therefore
implements the same recorded-dose rules, checked against the same JSON fixtures in
`__tests__/fixtures`. It does not start a second foreground JavaScript fetch.

## Meaning of the numbers

Today means local midnight through the displayed cutoff. Yesterday and each of the
previous seven days end at that same local clock time, including across daylight
saving changes. A selected completed day uses its full calendar day.

Basal coverage is the duration supported by completed recorded intervals. Explicit
delivered amounts are preferred. Loop completed intervals may use their recorded
absolute rate and duration. Generic programmed temporary rates and schedule gaps
do not establish delivery. Intervals are clipped to the requested window;
conflicting overlaps are excluded. Mutable and unfinished events are excluded.

An available summary requires known bolus and complete basal coverage. Only that
state has total insulin and a basal/bolus ratio. A partial summary preserves known
components and basal coverage without inventing a total. If both compared periods
have known bolus but incomplete basal, the comparison explicitly shows bolus only.
The weekly average requires all seven days for the component being compared.

Old native cached insulin without recorded evidence is discarded. Glucose can
remain available independently when insulin history fails.

## Regression checks

`WidgetDailyHttpTransportTest` exercises the production HTTP transport against a
local server reproducing legacy Nightscout object-sort rejection. Latest glucose
still loads in that failure mode, while daily range/treatment requests fail.
Bounded range requests omit unnecessary sort parameters and sort data locally.

Shared recorded-dose fixtures cover delivery amounts, clipping, gaps, overlaps,
deduplication and invalid events. Loader tests check request reuse, stale data and
account changes. Android instrumentation applies actual launcher RemoteViews in
English and Hebrew at several sizes, including incomplete insulin data.
