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

Basal is a rate (`U/hr`), drawn as steps. The scheduled profile is dashed;
temporary delivery is solid. A recorded suspension is zero. An unknown profile
is missing data, not zero.

Bolus is an event dose (`U`), drawn as bars. Simultaneous doses remain separate
records and stack visibly. The selected event window is five minutes on either
side of the cursor in both the lane and inspector.

Active insulin (`U`) and active carbohydrates (`g`) use separate scales. Missing
fields and long sampling gaps split the line. Negative active insulin is kept.
Glucose readouts do not carry a reading across gaps longer than ten minutes.

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
