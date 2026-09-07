# Day Graph calendar

The date control opens a calendar instead of resetting the graph to today.
Browsing a month/year does not change or reload the graph. Selecting a day
closes the calendar and opens that local day; Today is an explicit shortcut.
Dates remain selectable while summaries load or fail. Future dates are disabled.

## Display and integrity

- Shared Hebrew/English, RTL, light/dark, phone/tablet/desktop presentation.
- Each day has a target-range ring and percentage of valid recorded readings.
  These are not inferred glucose values during missing periods.
- Target thresholds come from the same host settings as Trends. Timestamp
  deduplication, validation and target buckets reuse Trends domain logic.
- Estimated coverage counts non-overlapping observed intervals, capped at one
  expected reading interval. A dense burst cannot hide the rest of a missing day.
- Today and low-coverage/unverified days are marked partial. No readings and
  unverified dates are distinct; zero percent is a valid measured result.
- Month/day arithmetic uses local calendar boundaries, including leap years and
  daylight-saving days. Today uses elapsed time, never future hours.

## Implementation seams

- `src/modules/dayGraph/domain/calendar.ts`: pure day summaries and date math.
- `src/product/dayGraph/DayGraphCalendarModal.tsx`: presentation and selection.
- `src/product/dayGraph/useDayGraphCalendar.ts`: lazy scoped reads, race rejection,
  retry, and up to three small month summaries in memory (five-minute freshness).
  It does not persist additional raw glucose history. Already visible day data
  remains discoverable if a month cannot be loaded offline.
- Optional `DayGraphDataSource.loadCalendarGlucose`: glucose only; no insulin,
  profiles, treatments or Journal reads. Native and Web adapters implement it.
- `src/platform/nightscout/loadCalendarGlucoseRange.ts`: at most seven days per
  request, two concurrent chunks, partial-success retention, source-change guards.

The native glucose reader now proves non-saturation with the existing complete
range reader before caching. Web checks the raw entries response count before
decoding. Stale, truncated and partially failed reads never prove an empty date.
Existing platform cache policies are unchanged: an uncached historical date may
remain unknown offline and become available after reconnecting.

## Verification

Calendar domain, hook, presentation and integration tests cover target bounds,
duplicates, zero/empty/unknown, dense uploads, sparse coverage, local boundaries,
leap days, future guards, lazy loading, retries, source changes and late responses.
Platform tests cover saturation, chunking, stale/partial responses and isolation.
The local-day suite also passes with `TZ=America/New_York` across both DST changes.

Verified 2026-09-07: 1,390 application tests across 255 suites passed, native/Web
strict TypeScript passed, and scoped lint passed. Test log:
`releases/qa/day-graph-calendar-tests.log`.

Browser QA uses only synthetic data in `web/day-graph-viewport-preview.html`:
Hebrew 390/320px, English dark desktop, landscape, month/year jump, historical
selection, Today, Escape and offline states. Add `calendar=offline` to exercise
an unavailable month. Web production build and service-worker checks pass.

This change does not itself publish a website or produce/send a new Android APK.
