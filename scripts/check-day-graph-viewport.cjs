/* eslint-env node, browser, es2022 */
// Real ProductShellView + DayGraphModuleView, with a fixed phone viewport.
// Stable release QA: yarn build:perf:web
// yarn preview:perf:web --port 4173 --strictPort
// CHART_VIEWPORT_URL=http://127.0.0.1:4173 node scripts/check-day-graph-viewport.cjs
// Development only: yarn web --host 127.0.0.1 --port 5174
// Run: PLAYWRIGHT_MODULE=/path/to/playwright PLAYWRIGHT_CHANNEL=msedge node scripts/check-day-graph-viewport.cjs
// Optional: CHART_VIEWPORT_LABEL=baseline, CHART_VIEWPORT_SIZES=390x844,
// CHART_VIEWPORT_THEMES=calmBlue, CHART_VIEWPORT_LOCALES=he.
const assert = require('node:assert/strict');
const {mkdirSync, writeFileSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const {join} = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseUrl = process.env.CHART_VIEWPORT_URL || 'http://127.0.0.1:5174';
const label = (process.env.CHART_VIEWPORT_LABEL || 'current').replace(/[^a-z0-9_-]/gi, '_');
const output = join('artifacts', 'chart-viewport', label);
const sizes = (process.env.CHART_VIEWPORT_SIZES || '390x844,360x740,320x640')
  .split(',').map(value => {
    const [width, height] = value.split('x').map(Number);
    assert(width >= 320 && height >= 320, `Invalid viewport ${value}`);
    return {width, height};
  });
const themes = (process.env.CHART_VIEWPORT_THEMES || 'calmBlue,darkFocus,highContrastRisk,sunsetGlow').split(',');
const locales = (process.env.CHART_VIEWPORT_LOCALES || 'he,en').split(',');
const chartId = 'day-graph-rich-chart';
const byId = value => `[data-testid="${value}"]`;

async function settled(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(120);
}

// Read dimensions directly. Neither this helper nor the initial proof scrolls,
// clicks, or invokes locator visibility helpers that could reveal hidden lanes.
async function measure(page, mode = 'separate') {
  return page.evaluate(({chartId: id, mode: chartMode}) => {
    const query = value => document.querySelector(`[data-testid="${value}"]`);
    const rect = element => {
      if (!element) {return null;}
      const value = element.getBoundingClientRect();
      return {x: value.x, y: value.y, width: value.width, height: value.height,
        right: value.right, bottom: value.bottom};
    };
    const axisBounds = svg => {
      const candidates = Array.from(svg.querySelectorAll('line'))
        .filter(line => Number(line.getAttribute('y1')) === Number(line.getAttribute('y2')))
        .map(line => {
          const matrix = line.getScreenCTM();
          if (!matrix) {return null;}
          const first = new DOMPoint(Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))).matrixTransform(matrix);
          const last = new DOMPoint(Number(line.getAttribute('x2')), Number(line.getAttribute('y2'))).matrixTransform(matrix);
          return {left: Math.min(first.x, last.x), right: Math.max(first.x, last.x), y: first.y};
        }).filter(Boolean).sort((a, b) => (b.right - b.left) - (a.right - a.left));
      return candidates[0] || null;
    };
    const keys = chartMode === 'separate'
      ? ['glucose', 'bolus', 'carbs', 'basal', 'iob', 'cob']
      : ['glucose', 'bolus', 'carbs', 'mixed'];
    const lanes = keys.map(key => {
      const lane = query(`${id}.${key}`);
      const svg = lane?.querySelector('svg');
      const marks = key === 'glucose' ? svg?.querySelectorAll('circle')
        : key === 'bolus' ? svg?.querySelectorAll('[data-testid="bolus-dose-bar"]')
        : key === 'carbs' ? svg?.querySelectorAll('[data-testid="carb-event-bar"]')
        : key === 'basal' ? svg?.querySelectorAll('[data-testid^="basal-"]')
        : svg?.querySelectorAll('path');
      return {key, lane: rect(lane), svg: rect(svg), axis: svg ? axisBounds(svg) : null,
        marks: marks?.length ?? 0, text: lane?.textContent ?? ''};
    });
    const shell = query(id);
    const rgba = value => {
      const channels = value.match(/[\d.]+/g)?.map(Number);
      return channels?.length >= 3 ? [...channels.slice(0, 3), channels[3] ?? 1] : null;
    };
    const luminance = channels => channels.slice(0, 3).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = element => {
      const foreground = rgba(getComputedStyle(element).fill);
      let background = [255, 255, 255, 1];
      let alpha = 1;
      for (let parent = element; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        alpha *= Number(style.opacity);
        const color = rgba(style.backgroundColor);
        if (color && color[3] > 0.99) { background = color; break; }
      }
      if (!foreground) {return null;}
      const opaque = foreground.slice(0, 3).map((channel, index) =>
        channel * alpha * foreground[3] + background[index] * (1 - alpha * foreground[3]));
      const first = luminance(opaque);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const svgLabels = Array.from(shell?.querySelectorAll('svg text') ?? []).map(element => {
      const style = getComputedStyle(element);
      const svg = element.ownerSVGElement;
      return {text: element.textContent, bounds: rect(element), svg: rect(svg),
        fontSize: parseFloat(style.fontSize), fill: style.fill, opacity: style.opacity,
        contrast: contrast(element)};
    });
    const clippedHtml = Array.from(shell?.querySelectorAll('div') ?? [])
      .filter(element => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1 &&
        element.childElementCount === 0 && element.textContent?.trim())
      .map(element => ({text: element.textContent, width: element.clientWidth, scrollWidth: element.scrollWidth}));
    const pageViewport = query('day-graph-module-view');
    return {
      screen: {width: innerWidth, height: innerHeight},
      fixture: document.documentElement.dataset.chartFixture,
      pageViewport: rect(pageViewport), pageScrollTop: pageViewport?.scrollTop,
      documentScrollTop: scrollY, documentWidth: document.documentElement.scrollWidth,
      navigation: rect(query('product-shell-phone-nav')),
      statusInset: rect(query('viewport-status-inset')),
      systemInset: rect(query('viewport-system-inset')),
      chart: rect(shell), lanes, svgLabels, clippedHtml,
      inspector: rect(query(`${id}.tooltipDock`)),
      embeddedMeals: query(`${id}.glucose`)?.querySelectorAll('[data-testid="carb-marker-cluster"]').length ?? 0,
      timeAxis: rect(query(`${id}.timeAxis`)),
      timeAxisCount: shell?.querySelectorAll(`[data-testid="${id}.timeAxis"]`).length ?? 0,
      plotTimeLabels: lanes.flatMap(item => Array.from(query(`${id}.${item.key}`)?.querySelectorAll('svg text') ?? [])
        .map(element => element.textContent).filter(value => /^\d{1,2}:\d{2}$/.test(value ?? ''))),
    };
  }, {chartId, mode});
}

function assertLabels(report) {
  assert.equal(report.documentWidth, report.screen.width, 'The screen must not overflow horizontally');
  assert.deepEqual(report.clippedHtml, [], 'Chart titles and readouts must not be horizontally clipped');
  for (const item of report.svgLabels) {
    assert(item.fontSize >= 10, `Unreadably small axis label: ${item.text} (${item.fontSize}px)`);
    assert(item.bounds.x >= item.svg.x - 1 && item.bounds.right <= item.svg.right + 1,
      `Axis label is clipped horizontally: ${item.text}`);
    assert(item.bounds.y >= item.svg.y - 1 && item.bounds.bottom <= item.svg.bottom + 1,
      `Axis label is clipped vertically: ${item.text}`);
    assert(item.contrast >= 4.5, `Axis label contrast is too low: ${item.text} (${item.contrast?.toFixed(2)}:1)`);
  }
}

function assertLanes(report, {fit, fullscreen = false, mode = 'separate'}) {
  const top = fullscreen ? 0 : report.pageViewport.y;
  const bottom = fullscreen ? report.screen.height : Math.min(report.pageViewport.bottom, report.navigation.y);
  assert(report.fixture === 'real-product-shell', 'Must run the real-shell fixture');
  if (!fullscreen) {
    assert(report.statusInset.height === 24 && report.systemInset.height === 24, 'The fixture must retain both system insets');
    assert(report.navigation.height >= 76, 'The real bottom navigation must occupy its full phone height');
    assert(report.navigation.bottom <= report.screen.height - 24 + 1,
      `Navigation must be visible above the system inset, not below the screen (${report.navigation.bottom} > ${report.screen.height - 24})`);
    assert(Math.abs(report.systemInset.bottom - report.screen.height) <= 1,
      'The simulated device frame must end at the physical viewport bottom');
    assert(report.pageViewport.bottom <= report.navigation.y + 1,
      'ProductPage must end before the real navigation');
  }
  for (const item of report.lanes) {
    assert(item.svg && item.marks > 0, `${item.key} must contain actual synthetic plotted data`);
    assert(item.axis && item.axis.right - item.axis.left >= 180, `${item.key} must retain a readable time axis`);
    assert(item.svg.height >= 20, `${item.key} plot must retain usable height`);
    if (fit) {
      assert(item.lane.y >= top - 1 && item.lane.bottom <= bottom + 1,
        `${item.key} must fit initially above navigation: lane ${item.lane.y.toFixed(1)}..${item.lane.bottom.toFixed(1)}, viewport ${top}..${bottom}`);
    }
  }
  if (mode === 'separate') {assert.equal(report.lanes.length, 6, 'All six distinct plots are required');}
  assert.equal(report.embeddedMeals, 0, 'Recorded meals must not overlap glucose samples');
  assert.equal(report.timeAxisCount, 1, 'All plots must use one shared bottom time axis');
  assert.deepEqual(report.plotTimeLabels, [], 'Individual plots must not repeat time-axis labels');
  assert(report.timeAxis && report.timeAxis.y >= report.lanes.at(-1).lane.bottom - 1,
    'The shared time axis must follow the final plot');
  if (fit) {assert(report.timeAxis.bottom <= bottom + 1, 'The complete shared time axis must fit above navigation');}
  const lefts = report.lanes.map(item => item.axis.left);
  const rights = report.lanes.map(item => item.axis.right);
  assert(Math.max(...lefts) - Math.min(...lefts) <= 1, 'All plots must start at the same time position');
  assert(Math.max(...rights) - Math.min(...rights) <= 1, 'All plots must end at the same time position');
  assertLabels(report);
}

async function touchTime(page, cdp, lane, fraction, expectedMinutes) {
  const point = {x: lane.axis.left + (lane.axis.right - lane.axis.left) * fraction,
    y: lane.svg.y + lane.svg.height / 2};
  assert(point.y > 0 && point.y < (await page.viewportSize()).height, 'Touch coordinates must already be on screen');
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await settled(page);
  const text = await page.getByTestId(`${chartId}.tooltipDock`).innerText();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  const minutesApart = match ? Math.abs(Number(match[1]) * 60 + Number(match[2]) - expectedMinutes) : Infinity;
  assert(match && Math.min(minutesApart, Math.abs(1440 - minutesApart)) <= 1,
    `Touch should select ${expectedMinutes} minutes, inspector shows ${text}`);
  return text;
}

function assertStablePlots(before, after) {
  for (const lane of before.lanes) {
    const current = after.lanes.find(item => item.key === lane.key);
    assert(current, `The ${lane.key} plot must remain mounted behind details`);
    for (const dimension of ['x', 'y', 'width', 'height']) {
      assert(Math.abs(current.lane[dimension] - lane.lane[dimension]) <= 1,
        `Opening or closing details must not change ${lane.key} ${dimension}`);
    }
  }
}

async function assertDetails(page, report, expectedValues, {mode = 'separate', waitForExpiry = false, screenshot} = {}) {
  const toggle = page.getByTestId('chart-inspector-toggle-details');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Collapsed details must have accessible state');
  assert.equal(await page.getByTestId('chart-inspector-value-basal').count(), 0, 'Inspection details start collapsed');
  await toggle.click();
  await settled(page);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'Expanded details must have accessible state');
  const modal = page.getByTestId('chart-inspector-details');
  await modal.waitFor({state: 'visible'});
  await page.waitForTimeout(350);
  const modalBounds = await modal.boundingBox();
  assert(modalBounds && modalBounds.x >= -1 && modalBounds.y >= -1 &&
    modalBounds.x + modalBounds.width <= report.screen.width + 1 &&
    modalBounds.y + modalBounds.height <= report.screen.height + 1,
  'The complete inspector sheet must fit inside the physical viewport');
  const snapshot = {};
  for (const key of ['basal', 'bolus', 'iob', 'cob', 'carbs']) {
    const value = (await page.getByTestId(`chart-inspector-value-${key}`).innerText()).trim();
    snapshot[key] = value;
    assert(value, `${key} detail must appear`);
    const bounds = await page.getByTestId(`chart-inspector-value-${key}`).boundingBox();
    assert(bounds && bounds.y >= modalBounds.y - 1 && bounds.y + bounds.height <= modalBounds.y + modalBounds.height + 1,
      `${key} selected value must be visible within the sheet`);
    if (expectedValues && key in expectedValues) {
      if (expectedValues[key] === null) {
        assert(!/\d/.test(value), `${key} must not invent a nearby recorded event`);
      } else {
        assert.equal(parseFloat(value), expectedValues[key], `${key} inspector must show the synthetic reading at the selected time`);
      }
    }
  }
  assertStablePlots(report, await measure(page, mode));
  if (screenshot) {await screenshot('details-sheet');}
  if (waitForExpiry) {
    await page.waitForTimeout(4300);
    assert.equal(await modal.count(), 1, 'The details sheet must remain mounted after the selection tooltip expires');
    for (const [key, value] of Object.entries(snapshot)) {
      assert.equal((await page.getByTestId(`chart-inspector-value-${key}`).innerText()).trim(), value,
        `${key} details must keep their selected snapshot after tooltip expiry`);
    }
  }
  await page.getByTestId('chart-inspector-close-details').click();
  await settled(page);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Closing the sheet resets accessible expanded state');
  assert.equal(await page.getByTestId('chart-inspector-value-basal').count(), 0, 'Collapsing hides the expanded details');
  assertStablePlots(report, await measure(page, mode));
}

async function assertShortPhoneScroll(page, cdp, report, fullscreen = false) {
  const bottom = fullscreen ? report.screen.height : report.navigation.y;
  const last = report.lanes[report.lanes.length - 1];
  if (last.lane.bottom <= bottom) {
    return;
  }
  const point = {x: report.screen.width / 2, y: bottom - 48};
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point]});
  for (let step = 1; step <= 6; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{...point, y: point.y - step * 28}],
    });
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(200);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await settled(page);
  const after = await measure(page);
  const revealed = after.lanes[after.lanes.length - 1];
  assert(revealed.lane.y < last.lane.y - 20,
    'A short phone must allow a real vertical touch gesture to scroll the chart');
  assert(revealed.lane.bottom <= bottom + 1 && revealed.lane.y >= 0,
    'The complete active-carb lane must be reachable by scrolling on a short phone');
  assert(after.timeAxis.bottom <= bottom + 1,
    'The complete shared time axis must also be reachable by scrolling on a short phone');
  return after;
}

async function assertLaneValues(page, expectedValues) {
  for (const [laneKey, expected] of Object.entries(expectedValues)) {
    const text = await page.getByTestId(`${chartId}.${laneKey}`).innerText();
    const line = text.split('\n').find(value => /^\d+(?:\.\d+)?\s+(?:U\/hr|U|g)$/.test(value.trim()));
    if (expected === null) {
      assert(!line, `${laneKey} must show no nearby record; saw ${text}`);
    } else {
      assert(line && parseFloat(line) === expected, `${laneKey} lane must show ${expected}; saw ${text}`);
    }
  }
}

async function assertModeSurvivesReload(page) {
  await page.getByTestId('day-graph-range-3').click();
  const fixture = page.getByTestId('viewport-fixture-state');
  const before = Number(await fixture.getAttribute('data-save-count'));
  await page.getByTestId('day-graph-chart-mode-combined').click();
  await page.waitForFunction(previous => {
    const state = document.querySelector('[data-testid="viewport-fixture-state"]');
    return Number(state?.getAttribute('data-save-count')) > previous &&
      state?.getAttribute('data-saved-mode') === 'mixed';
  }, before);
  const savedRange = await fixture.getAttribute('data-saved-range');
  assert.equal(savedRange, 'full-day', 'Mode autosave must retain the remembered full-day range');
  assert.equal(await page.getByTestId('day-graph-range-3').getAttribute('aria-pressed'), 'true',
    'Autosave must preserve the current exploratory 3-hour view until reload');
  await page.reload();
  await page.getByTestId(`${chartId}.mixed`).waitFor({state: 'attached'});
  await settled(page);
  assert.equal(await page.getByTestId('day-graph-chart-mode-combined').getAttribute('aria-pressed'), 'true',
    'The actual persistence store must restore mixed mode after a page reload');
  assert.equal(await page.getByTestId('day-graph-range-all').getAttribute('aria-pressed'), 'true',
    'Reload must restore the remembered full-day range, not the unsaved exploratory zoom');
  return {savedRange, savedMode: await fixture.getAttribute('data-saved-mode')};
}

async function runCase(browser, viewport, theme, locale) {
  const key = `${viewport.width}x${viewport.height}-${locale}-${theme}`;
  const record = {key, viewport, theme, locale, failures: [], screenshots: [], navigationEvents: []};
  const page = await browser.newPage({viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1});
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {record.navigationEvents.push({url: frame.url(), at: new Date().toISOString()});}
  });
  const check = async (name, action) => {
    try { await action(); }
    catch (error) { record.failures.push({name, message: error.message}); }
  };
  const screenshot = async name => {
    const path = join(output, `${key}-${name}.png`);
    await page.screenshot({path, fullPage: false});
    record.screenshots.push(path);
  };
  try {
    await page.goto(`${baseUrl}/day-graph-viewport-preview.html?locale=${locale}&theme=${theme}&persistKey=${key}`);
    await page.locator(`${byId(`${chartId}.cob`)} svg`).waitFor({state: 'attached'});
    await settled(page);
    record.initial = await measure(page);
    await screenshot('initial');
    await check('initial viewport contains six readable plots without any scroll', () => {
      assert.equal(record.initial.pageScrollTop, 0, 'Initial ProductPage must not scroll');
      assert.equal(record.initial.documentScrollTop, 0, 'Initial document must not scroll');
      assertLanes(record.initial, {fit: viewport.width >= 360});
    });
    const cdp = await page.context().newCDPSession(page);
    if (viewport.width < 360) {
      await check('short phone can reveal the last plot by real touch scrolling', async () => {
        record.scrolled = await assertShortPhoneScroll(page, cdp, record.initial);
        await screenshot('scrolled');
        // This occurs only after the recorded no-scroll initial proof. Restore
        // the fixture's page for the following independent mode checks.
        await page.getByTestId('day-graph-module-view').evaluate(element => { element.scrollTop = 0; });
        await settled(page);
      });
    }
    if (viewport.width >= 360 && !record.failures.length) {
      await check('touch selection updates each on-screen lane without moving the chart', async () => {
        for (const [index, lane] of record.initial.lanes.entries()) {
          await touchTime(page, cdp, lane, (8 + index) / 24, (8 + index) * 60);
        }
        const after = await measure(page);
        assert.equal(after.pageScrollTop, 0, 'Tap must not scroll ProductPage');
        assert(Math.abs(after.lanes[0].lane.y - record.initial.lanes[0].lane.y) <= 1, 'Selection must not move plot positions');
      });
      // The shared synthetic fixture has a 3.1 U bolus at 13:00, scheduled
      // 0.78 U/hr basal, 3.55 U IOB, and 0 g COB before the 13:15 meal.
      const selectedValues = {basal: 0.78, bolus: 3.1, iob: 3.55, cob: 0, carbs: null};
      await check('all lane readouts use the same selected timestamp', async () => {
        await touchTime(page, cdp, record.initial.lanes[0], 13 / 24, 13 * 60);
        await assertLaneValues(page, selectedValues);
      });
      await check('details sheet preserves plots and selected source values', () => assertDetails(page, record.initial, selectedValues));
      await check('recorded grams and active carbs inspect the actual meal timestamp', async () => {
        await touchTime(page, cdp, record.initial.lanes.find(item => item.key === 'carbs'), 13.25 / 24, 13 * 60 + 15);
        const mealValues = {basal: 0.78, bolus: null, iob: 3.38, cob: 58, carbs: 58};
        await assertLaneValues(page, mealValues);
        await assertDetails(page, record.initial, mealValues);
      });
    }
    await page.getByTestId('day-graph-chart-mode-combined').click();
    await settled(page);
    record.overlay = await measure(page, 'mixed');
    await screenshot('overlay');
    await check('overlay remains readable and fits the viewport', async () => {
      assertLanes(record.overlay, {fit: viewport.width >= 360, mode: 'mixed'});
      const overlay = page.getByTestId(`${chartId}.mixed`);
      for (const series of ['basal-scheduled-segment', 'iob-line-segment', 'cob-line-segment']) {
        assert(await overlay.getByTestId(series).count(), `${series} must actually be drawn in the overlay`);
      }
      if (viewport.width >= 360) {
        const bottom = record.overlay.lanes.find(item => item.key === 'mixed');
        const point = {x: bottom.axis.left + (bottom.axis.right - bottom.axis.left) * 13.25 / 24,
          y: bottom.svg.bottom - 10};
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point]});
        await settled(page);
        record.overlayHeld = await measure(page, 'mixed');
        assert(record.overlayHeld.inspector.y >= record.overlayHeld.pageViewport.y - 1 &&
          record.overlayHeld.inspector.bottom <= record.overlayHeld.navigation.y + 1,
        'The selected glucose/time header must remain visible while holding the bottom plot');
        await screenshot('mixed-held-1315');
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        await assertDetails(page, record.overlayHeld,
          {basal: 0.78, bolus: null, iob: 3.38, cob: 58, carbs: 58},
          {mode: 'mixed', waitForExpiry: locale === 'he' && theme === 'darkFocus', screenshot});
      }
    });
    await page.getByTestId('day-graph-chart-mode-detailed').click();
    await page.getByTestId('chart.cgmGraph.fullscreenButton').click();
    await page.getByTestId('day-graph-fullscreen-close').waitFor();
    await page.waitForTimeout(350);
    await settled(page);
    record.fullscreen = await measure(page);
    await screenshot('fullscreen');
    await check('fullscreen retains unclipped plots and fits regular phones', () =>
      assertLanes(record.fullscreen, {fit: viewport.width >= 360, fullscreen: true}));
    if (viewport.width < 360) {
      await check('short-phone fullscreen can reveal the last plot by touch scrolling', async () => {
        record.fullscreenScrolled = await assertShortPhoneScroll(page, cdp, record.fullscreen, true);
        await screenshot('fullscreen-scrolled');
      });
    }
    await page.getByTestId('day-graph-fullscreen-close').click();
    await page.waitForTimeout(350);
    await settled(page);
    await check('closing fullscreen preserves original mode and viewport', async () => {
      const restored = await measure(page);
      assert.equal(restored.pageScrollTop, 0);
      assertLanes(restored, {fit: viewport.width >= 360});
    });
    await check('mixed mode autosaves through the real store and survives reload', async () => {
      record.persistence = await assertModeSurvivesReload(page);
      await screenshot('mixed-restored');
    });
    await check('no browser runtime errors', () => assert.deepEqual(runtimeErrors, []));
  } catch (error) {
    record.failures.push({name: 'fixture execution', message: error.message});
    await screenshot('failure').catch(() => {});
  } finally {
    await page.close();
  }
  const success = viewport.width >= 360
    ? 'six plots inside initial viewport, real nav/insets, touch, modal details, overlay, fullscreen, persisted mode'
    : 'short-phone readable plots, real touch scrolling, real nav/insets, overlay, fullscreen';
  console.log(`${record.failures.length ? 'FAIL' : 'PASS'} ${key}${record.failures.length ? `: ${record.failures.map(item => item.message).join(' | ')}` : `: ${success}`}`);
  return record;
}

async function runMealCase(browser, viewport, theme) {
  const key = `${viewport.width}x${viewport.height}-he-${theme}-cluster-boundary`;
  const record = {key, viewport, theme, locale: 'he', mealCase: 'cluster-boundary',
    sourceValues: {lunchRecordsGrams: [58, 12, 7], lunchRecordedTotalGrams: 77,
      independentlyReportedCobGrams: 58, midnightGrams: 11, dayEndGrams: 17},
    failures: [], screenshots: []};
  const page = await browser.newPage({viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1});
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  const screenshot = async name => {
    const path = join(output, `${key}-${name}.png`);
    await page.screenshot({path, fullPage: false});
    record.screenshots.push(path);
  };
  try {
    await page.goto(`${baseUrl}/day-graph-viewport-preview.html?locale=he&theme=${theme}&mealCase=cluster-boundary&persistKey=${key}`);
    await page.locator(`${byId(`${chartId}.carbs`)} svg`).waitFor({state: 'attached'});
    await settled(page);
    record.initial = await measure(page);
    assertLanes(record.initial, {fit: true});
    const lane = record.initial.lanes.find(item => item.key === 'carbs');
    const bars = await page.getByTestId(`${chartId}.carbs`).getByTestId('carb-event-bar').evaluateAll(elements =>
      elements.map(element => {
        const bounds = element.getBoundingClientRect();
        return {x: bounds.x, right: bounds.right, y: bounds.y, bottom: bounds.bottom,
          height: bounds.height, width: bounds.width};
      }));
    assert.equal(bars.length, 7, 'All seven recorded meals must retain their source marks');
    for (const bar of bars) {
      assert(bar.x >= lane.axis.left - 1 && bar.right <= lane.axis.right + 1,
        'Boundary and clustered meal bars must stay inside the time plot');
      assert(bar.y >= lane.svg.y - 1 && bar.bottom <= lane.svg.bottom + 1 && bar.height >= 1,
        'Every recorded gram mark must be visible inside its own lane');
    }
    record.barBounds = bars;
    const cdp = await page.context().newCDPSession(page);
    await touchTime(page, cdp, lane, 13.25 / 24, 795);
    await assertLaneValues(page, {carbs: 77, cob: 58});
    await screenshot('cluster-selected');
    await assertDetails(page, record.initial, {carbs: 77, cob: 58}, {screenshot});
    await touchTime(page, cdp, lane, 0, 0);
    await assertLaneValues(page, {carbs: 11});
    await screenshot('midnight-selected');
    await touchTime(page, cdp, lane, 1 - 1 / (24 * 3600000), 1439);
    await assertLaneValues(page, {carbs: 17});
    await screenshot('day-end-selected');
    await page.getByTestId('day-graph-chart-mode-combined').click();
    await settled(page);
    record.overlay = await measure(page, 'mixed');
    assertLanes(record.overlay, {fit: true, mode: 'mixed'});
    await touchTime(page, cdp, record.overlay.lanes.find(item => item.key === 'carbs'), 13.25 / 24, 795);
    await assertLaneValues(page, {carbs: 77});
    await assertDetails(page, record.overlay, {carbs: 77, cob: 58}, {mode: 'mixed'});
    await screenshot('mixed-cluster-selected');
    assert.deepEqual(runtimeErrors, [], 'Meal boundary/cluster interactions must not throw browser errors');
  } catch (error) {
    record.failures.push({name: 'clustered and boundary meal source values', message: error.message});
    await screenshot('failure').catch(() => {});
  } finally {await page.close();}
  console.log(`${record.failures.length ? 'FAIL' : 'PASS'} ${key}${record.failures.length ? `: ${record.failures.map(item => item.message).join(' | ')}` : ': clustered and boundary grams preserved; recorded77g and active58g remain distinct'}`);
  return record;
}

async function main() {
  mkdirSync(output, {recursive: true});
  let dirtyPaths = [];
  try { dirtyPaths = execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim().split('\n').filter(Boolean); }
  catch { /* Source state is optional metadata; browser assertions still run. */ }
  const report = {label, startedAt: new Date().toISOString(), fixture: 'real-product-shell',
    sourceState: {dirty: dirtyPaths.length > 0, dirtyPaths}, cases: []};
  const browser = await chromium.launch({headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? {channel: process.env.PLAYWRIGHT_CHANNEL} : {})});
  try {
    for (const viewport of sizes) {for (const theme of themes) {for (const locale of locales) {
      report.cases.push(await runCase(browser, viewport, theme, locale));
      writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2));
    }}}
    for (const viewport of sizes.filter(size => size.width >= 360)) {
      for (const theme of themes.filter(value => ['darkFocus', 'calmBlue'].includes(value))) {
        report.cases.push(await runMealCase(browser, viewport, theme));
        writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2));
      }
    }
  } finally {
    await browser.close();
    report.finishedAt = new Date().toISOString();
    report.passed = report.cases.length > 0 && report.cases.every(item => !item.failures.length);
    writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2));
  }
  if (!report.passed) {process.exitCode = 1;}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
