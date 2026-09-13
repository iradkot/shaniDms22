# Application performance

Run `yarn perf:app` for a focused, deterministic check of actual application
work. It covers production chart rendering, compiled native worklets, touch
bursts, cache writes, startup route evaluation, AI presentation and historical
data activation. Reports include the source commit and working-tree status in
`artifacts/performance/summary.json` and `contracts.json`.

Every deterministic run invalidates the previous successful report before doing
work. `summary.json` records `running`, `passed`, or `failed`, the current stage
and source revision. An interrupted run cannot masquerade as an old success;
a failing Jest report remains available alongside the failed summary.
`yarn verify:performance-runner` checks this behavior in milliseconds without
launching Jest or touching real report files, and is included in `verify:all`.

These tests count unnecessary work instead of enforcing machine-specific timing
thresholds. The full `yarn verify:all` includes the same Jest regressions and the
compiled-worklet checks. No extra dependency or production telemetry is needed.

## Browser profiling

Start `yarn web --host 127.0.0.1`, then run `yarn perf:app:browser` with Playwright
installed. If using an existing installation, set `PLAYWRIGHT_MODULE` to its
module path and optionally `PLAYWRIGHT_CHANNEL` to an installed Chromium channel.
`APP_PERF_URL` overrides the server origin. `PERF_CPU_THROTTLE` defaults to 4;
set it to 1 for an unthrottled measurement.

For the production version of the same fixture, run `yarn build:perf:web`, then
`yarn preview:perf:web --port 4173`. Set `APP_PERF_URL=http://127.0.0.1:4173`
when running the same `yarn perf:app:browser` command. The build reuses the
application's Vite configuration and writes only to the profiling output folder.

The runner uses the existing synthetic day-graph preview at a 390px width. It
drives 120 real browser touch samples, checks the final selected time and records
React commit cost, frame gaps and long tasks in
`artifacts/performance/browser.json`. The profiler is confined to the preview
entry; it is never mounted by the application. No account data is recorded.
Reports identify the build mode. Production React Profiler counters are
unavailable and reported as `null`; frame gaps and long tasks remain measured.

Browser development rendering and CPU throttling are diagnostic tools, not
Android frame-rate measurements. Compare runs using the same build mode, browser,
hardware and fixture. Keep timing out of CI pass/fail gates. For a device check,
use the release APK and Android's profiler/frame statistics on an authorized
device; a debug build or browser result cannot establish native release FPS.

## Measured regressions fixed in September 2026

The following before/after figures came from deterministic synthetic fixtures
through the actual application code. CPU timings are observations on the
development computer, not device guarantees.

| Scenario                                                          | Before                   | After                                    |
| ----------------------------------------------------------------- | ------------------------ | ---------------------------------------- |
| 120 vertical touch samples                                        | 120 JS deliveries        | 0                                        |
| 120 moves while JS is busy                                        | 120 queued moves         | 1 pending delivery, then newest position |
| 120 moves within one display frame                                | 113 inspection renders   | 1                                        |
| 60 selections across 288 glucose readings                         | 17,340 color evaluations | 60 inspector evaluations                 |
| Same chart fixture, renderer JS time                              | 1,513ms                  | 281ms                                    |
| Full load-history normalization during 60 selections              | 60                       | 0                                        |
| Separate load-path redraws during 60 selections                   | 120                      | 0                                        |
| Warm glucose refresh with 21MB across three cached sources        | about 185ms              | about 7ms                                |
| Unrelated cache resources rewritten by that refresh               | 8                        | 0                                        |
| Secondary native screen modules evaluated at startup              | 13                       | 0                                        |
| Unused Markdown parser/rules/style in shared AI engine            | 3                        | 0                                        |
| Latest-reading request pairs when App and AI mount                | 2                        | 1 shared owner                           |
| Background 14-day therapy requests while opening the product host | 2                        | 0                                        |
| Distant bolus timestamp reads during 60 cursor moves (stacked / external / internal tooltip) | 120 / 180 / 270 | 0 after source preparation |
| Source-value reads for a synthetic 8,352-reading calendar month | 50,112 | 25,056 |
| Visible calendar fallback rescans on timeline-only updates or monthly-load completion | 1 per update | 0 |
| Daily summary source-value accesses for 288 readings | 1,728 | 864 |
| AGP timestamp accesses for 8,064 readings across 28 days | 471,687 | 96,794 |
| Mixed IOB/COB chart source-date accesses for 48 records on mount | 240 | 144 |

Cold cache discovery still reads persisted entries once to establish the shared
byte/retention budget. Warm writes use scalar metadata and only rewrite changed
or expired envelopes. The persisted format and single cache owner are retained.

An additional production browser run at 4× CPU throttling completed all 120
touch samples with the expected final cursor, a 30.2ms p95 frame gap and zero
long tasks. This is observational evidence for that fixture, not a native-device
FPS guarantee.

The September 13 follow-up keeps original event records and duplicate times.
The tooltip shares a private prepared event index, uses bounded binary searches,
and preserves the stacked five-minute and legacy thirty-minute windows and tie
policies. Source-array or display-domain replacement rebuilds the index; cursor
movement does not. Source arrays retain the existing immutable-input contract.

Calendar and Trends share `buildTrendsRangeSummary`: input validation, timestamp
deduplication and target buckets live in one place. Calendar no longer computes
unused mean/CV/GRI metrics or prepares the same samples twice. Calendar interval
coverage remains separate, including local days and DST. A seeded differential
check compared 500 fixtures with the previous full Trends overview and found
identical outputs. On this computer, a synthetic month's median CPU time fell
from 3.520ms to 2.016ms; this is not an Android frame-rate measurement.

`yarn perf:app` includes the event-index and calendar work budgets.
`yarn test:calendar` also runs the shared range-summary correctness tests.

Verified September 13, 2026: 1,575 application tests across 272 suites,
101 focused performance contracts, six report-lifecycle tests, both strict
TypeScript checks, scoped lint, and Web production build passed. Calendar checks
passed 118 tests plus the eight-test DST rerun. Android and iOS JavaScript
production bundles also compiled; these are not APK/IPA release builds.
A production browser run completed 120 touch samples at 4× CPU throttling,
with the expected final cursor, 12.2ms p95 frame gaps and no long tasks.

These checks ran against the working tree, which also contains separate ongoing
Home/Trends/Alerts work. This performance change does not publish those changes,
deploy a website, or distribute a build. Existing Web chunk-size warnings remain;
no warning threshold or data-fidelity check was relaxed to obtain a passing build.

## Shared calculations and DX follow-up

`buildTrendsDescriptiveSummary` now serves Daily Overview, Previous Day Summary
and the full Trends overview. It shares validation, range weighting, mean,
variation and observed extremes over one prepared sample set. Calendar keeps
using the lighter range-only summary. Raw mean remains private and feeds GMI
without display rounding; representative GRI is only computed when returned.
Each retrospective window still owns its excluded/duplicate counts. It must not
reuse one globally deduplicated window or change the meaning of missing data.

Daily AGP profiles advance through the already sorted readings once. They retain
every empty/clipped day and its leading/trailing gaps, fixed-offset semantics
and coverage thresholds. A 500-fixture old/new comparison and a separate
240-case edge review matched every returned field, including fractional and
negative timestamps. The work budget exercises the public AGP builder.

The mixed mini-chart prepares IOB and COB together via
`buildMiniLoadSegmentsByKind`; the single-kind builder shares the private
preparation and segmentation logic. Missing values, duplicate-time rules,
signed IOB, COB clamping and gap splits are unchanged. One thousand seeded
paired/single-kind comparisons against the previous implementation matched.

Unused bolus/carb scanning helpers were removed after checking all callers.
`yarn perf:cgm-selection` now measures the production event index: one-time
preparation and cursor-query timings are reported separately. Historical numbers
in `PerformanceAnalysis.HomeAndCharts.md` remain labeled as historical evidence.
`yarn perf:app` includes the new daily-summary, AGP and paired-load work budgets.

The descriptive-summary tests preserve pre-refactor outputs across 24 seeded
fixtures for each of Trends, Daily Overview and Previous Day Summary. Tests run
unchanged under UTC, Asia/Jerusalem and America/New_York; neighboring explicit
expectations cover rounding, validation order, invalid/duplicate inputs and the
raw-mean GMI precision boundary.

Verification for this second September 13 pass: 1,594 application tests across
275 suites (including the captured-output snapshot), 123 focused performance
contracts, 118 calendar tests plus eight DST cases, both strict TypeScript
checks and scoped lint passed. Web production build and Android/iOS JavaScript
bundles passed. No new APK/IPA was built or distributed by this pass; the same
working-tree and deployment caveats above apply.

## Rules for future changes

- Keep high-frequency transient input separate from source data preparation.
  Use the shared latest-frame policy and preserve the final release position.
- Memoize immutable chart geometry; invalidate it for data, theme and size
  changes. Do not remove medical facts or hide missing-data gaps for speed.
- Load historical analyses when their existing view mounts. Hosts register data
  capabilities; they do not precompute every destination's result.
- Keep cache updates local to the changed resource. Preserve source/account
  isolation, expiry, byte limits, LRU and failure recovery tests.
- Keep formatting and Markdown presentation in views. Shared data/AI engines
  should not initialize unused UI resources.
- The App owns the latest-reading request and polling. AI consumes the same
  provider and guarded sample selector; it must not start another polling hook.
- Use the existing route loader and Metro exclusions. Generated QA captures,
  build outputs and APKs belong in ignored output folders, not the source graph.
