/* eslint-env node, browser, es2022 */
// Real ProductShellView + DayGraphModuleView, with a fixed phone viewport.
// Start: yarn web --host 127.0.0.1 --port 5174
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
    const keys = chartMode === 'separate' ? ['glucose', 'bolus', 'basal', 'iob', 'cob'] : ['glucose', 'bolus', 'mixed'];
    const lanes = keys.map(key => {
      const lane = query(`${id}.${key}`);
      const svg = lane?.querySelector('svg');
      const marks = key === 'glucose' ? svg?.querySelectorAll('circle')
        : key === 'bolus' ? svg?.querySelectorAll('[data-testid="bolus-dose-bar"]')
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
  if (mode === 'separate') {assert.equal(report.lanes.length, 5, 'All five distinct plots are required');}
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
  assert(match && Math.abs(Number(match[1]) * 60 + Number(match[2]) - expectedMinutes) <= 1,
    `Touch should select ${expectedMinutes} minutes, inspector shows ${text}`);
  return text;
}

async function assertDetails(page, report, expectedValues) {
  const toggle = page.getByTestId('chart-inspector-toggle-details');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Collapsed details must have accessible state');
  assert.equal(await page.getByTestId('chart-inspector-value-basal').count(), 0, 'Inspection details start collapsed');
  await toggle.click();
  await settled(page);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'Expanded details must have accessible state');
  for (const key of ['basal', 'bolus', 'iob', 'cob']) {
    const value = (await page.getByTestId(`chart-inspector-value-${key}`).innerText()).trim();
    assert(value, `${key} detail must appear`);
    if (expectedValues) {
      assert.equal(parseFloat(value), expectedValues[key], `${key} inspector must show the synthetic reading at the selected time`);
    }
  }
  await toggle.click();
  await settled(page);
  assert.equal(await page.getByTestId('chart-inspector-value-basal').count(), 0, 'Collapsing hides the expanded details');
  const after = await measure(page);
  assert(Math.abs(after.lanes[0].lane.y - report.lanes[0].lane.y) <= 1,
    'Collapsing details must restore the initial glucose position');
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
  return after;
}

async function runCase(browser, viewport, theme, locale) {
  const key = `${viewport.width}x${viewport.height}-${locale}-${theme}`;
  const record = {key, viewport, theme, locale, failures: [], screenshots: []};
  const page = await browser.newPage({viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1});
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
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
    await page.goto(`${baseUrl}/day-graph-viewport-preview.html?locale=${locale}&theme=${theme}`);
    await page.locator(`${byId(`${chartId}.cob`)} svg`).waitFor({state: 'attached'});
    await settled(page);
    record.initial = await measure(page);
    await screenshot('initial');
    await check('initial viewport contains five readable plots without any scroll', () => {
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
      const selectedValues = {basal: 0.78, bolus: 3.1, iob: 3.55, cob: 0};
      await check('all lane readouts use the same selected timestamp', async () => {
        await touchTime(page, cdp, record.initial.lanes[0], 13 / 24, 13 * 60);
        for (const [laneKey, expected] of Object.entries(selectedValues)) {
          const text = await page.getByTestId(`${chartId}.${laneKey}`).innerText();
          const line = text.split('\n').find(value => /^\d+(?:\.\d+)?\s+(?:U\/hr|U|g)$/.test(value.trim()));
          assert(line && parseFloat(line) === expected, `${laneKey} lane must show ${expected} at 13:00; saw ${text}`);
        }
      });
      await check('details expand and collapse with aligned selected readouts', () => assertDetails(page, record.initial, selectedValues));
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
      if (viewport.width >= 360) {await touchTime(page, cdp, record.overlay.lanes[2], 13 / 24, 13 * 60);}
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
    await check('no browser runtime errors', () => assert.deepEqual(runtimeErrors, []));
  } catch (error) {
    record.failures.push({name: 'fixture execution', message: error.message});
    await screenshot('failure').catch(() => {});
  } finally {
    await page.close();
  }
  const success = viewport.width >= 360
    ? 'five plots inside initial viewport, real nav/insets, touch, details, overlay, fullscreen'
    : 'short-phone readable plots, real touch scrolling, real nav/insets, overlay, fullscreen';
  console.log(`${record.failures.length ? 'FAIL' : 'PASS'} ${key}${record.failures.length ? `: ${record.failures.map(item => item.message).join(' | ')}` : `: ${success}`}`);
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
  } finally {
    await browser.close();
    report.finishedAt = new Date().toISOString();
    report.passed = report.cases.length > 0 && report.cases.every(item => !item.failures.length);
    writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2));
  }
  if (!report.passed) {process.exitCode = 1;}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
