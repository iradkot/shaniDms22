# Application performance

Run `yarn perf:app` for a focused, deterministic check of actual application
work. It covers production chart rendering, compiled native worklets, touch
bursts, cache writes, startup route evaluation, AI presentation and historical
data activation. Reports include the source commit and working-tree status in
`artifacts/performance/summary.json` and `contracts.json`.

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

Cold cache discovery still reads persisted entries once to establish the shared
byte/retention budget. Warm writes use scalar metadata and only rewrite changed
or expired envelopes. The persisted format and single cache owner are retained.

An additional production browser run at 4× CPU throttling completed all 120
touch samples with the expected final cursor, a 30.2ms p95 frame gap and zero
long tasks. This is observational evidence for that fixture, not a native-device
FPS guarantee.

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
