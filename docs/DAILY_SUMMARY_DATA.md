# Daily summary data

The in-app Daily Overview and Android summary widget show recorded insulin.
Neither fills missing basal intervals from a programmed profile.
For new consumers, start with [Data access and calculations](DATA_ACCESS.md).

## Entry points

- `src/services/insulin/recordedInsulin.ts`: pure treatment-to-summary calculation.
- `src/services/insulin/recordedInsulinDataSource.ts`: one fresh, account-scoped
  treatment snapshot reused for the selected day and its seven comparison days.
- `src/services/insulin/createRecordedInsulinDataSource.ts`: the same loader with
  injected browser/native/test transport; pure implementation without native imports.
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

Basal coverage is the duration supported by completed recorded intervals with an
explicit `deliveredUnits`, or Loop's uploaded `amount`. Rate and duration alone do
not establish delivered units, even for Loop records whose end time has passed.
Generic programmed temporary rates and schedule gaps do not establish delivery.
Intervals are clipped to the requested window; conflicting overlaps are excluded.
Mutable and unfinished events are excluded. Snapshot observation time stays fixed
when a cached result is reused; waiting cannot make an old dose record more final.

Bolus records with a duration are allocated by overlap, including Loop's `normal`
boluses. Interval allocation is proportional to duration, not a measurement of
individual pump pulses. Distinct dose identities remain distinct; duplicate
versions of one identity do not add another dose. Numeric epoch timestamps and
ISO timestamps follow the same rules in the app, Web decoder and native widget.

An available summary requires known bolus and complete basal coverage. Only that
state has total insulin and a basal/bolus ratio. A partial summary preserves known
components and basal coverage without inventing a total. If both compared periods
have known bolus but incomplete basal, the comparison explicitly shows bolus only.
The weekly average requires all seven days for the component being compared.

The widget shows recorded basal subtotals even when coverage is partial. Its partial
basal bar represents recorded time coverage, not an insulin ratio; the adjacent
label identifies this. Compact widgets omit that bar but retain the subtotal.
Comparison amounts remain visible when the widget is too short for comparison
charts. Coverage just below 100% is displayed as `<100%`, never rounded to complete.

Old native cached insulin without recorded evidence is discarded. Glucose can
remain available independently when insulin history fails.

## Glucose interval contract

Daily Overview and the summary widget both weight readings by observed time.
Each valid reading (20–600 mg/dL) covers time until the next valid reading, the
sample cadence limit (normally five minutes), or the displayed cutoff, whichever
comes first. A carry-in reading may cover midnight. Gaps are never filled.

Time in range divides in-range milliseconds by observed milliseconds. CGM coverage
divides observed milliseconds by the elapsed window. Daily descriptive mean/CV
and general Trends statistics remain sample-based. Display rounding can differ
(integer percentages in the widget), but the underlying interval rules match.

## Source evidence for the delivery rules

Verified against these pinned upstream sources:

- [Loop's Nightscout dose conversion](https://github.com/LoopKit/NightscoutService/blob/2cef4896f0704fb112575ab34b596ee7de78e48d/NightscoutServiceKit/Extensions/DoseEntry.swift)
  exports duration even for boluses labeled `normal`, omits scheduled basal doses,
  and keeps temporary basal's delivered amount separate from its programmed rate.
- [Loop's dose uploader](https://github.com/LoopKit/Loop/blob/2df7179c966e5ee5feb05cc9104853d42308dbdb/Loop/Managers/RemoteDataServicesManager.swift)
  reads from [InsulinDeliveryStore](https://github.com/LoopKit/LoopKit/blob/f3eecc265273e9f2f5209b605fb4c84b64598b1a/LoopKit/InsulinKit/InsulinDeliveryStore.swift).
  A rate-only exported record cannot establish a finalized delivered amount.

These are parser contracts, not a claim that a particular user's pump and
Nightscout histories have been reconciled. See the accuracy limits in the data guide.

## Regression checks

`WidgetDailyHttpTransportTest` exercises the production HTTP transport against a
local server reproducing legacy Nightscout object-sort rejection. Latest glucose
still loads in that failure mode, while daily range/treatment requests fail.
Bounded range requests omit unnecessary sort parameters and sort data locally.

Shared recorded-dose fixtures cover delivery amounts, clipping, gaps, overlaps,
deduplication and invalid events. Loader tests check request reuse, stale data and
account changes. Android instrumentation applies actual launcher RemoteViews in
English and Hebrew at several sizes, including incomplete insulin data.

`__tests__/fixtures/daily-glucose-intervals.json` is also consumed by both platforms.
It covers irregular cadence, gaps, carry-in, duplicate timestamps and short windows.
