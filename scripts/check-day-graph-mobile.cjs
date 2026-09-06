/* eslint-env node, browser, es2022 */
// Run against `yarn web --host 127.0.0.1` with Playwright installed, or set
// PLAYWRIGHT_MODULE to an existing Playwright package. Uses synthetic data only.
const assert = require('node:assert/strict');
const {mkdirSync} = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
function assertTime(text, expectedMinutes, message) {
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  assert(match, 'Inspector must expose a selected time');
  assert(
    Math.abs(Number(match[1]) * 60 + Number(match[2]) - expectedMinutes) <= 1,
    `${message}: expected ${expectedMinutes}, saw ${match[0]}`,
  );
}

async function assertNoClipping(page, width) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    `${width}px page must not overflow horizontally`,
  );
  const clipped = await page
    .getByTestId('day-graph-rich-chart.mixed')
    .locator('div')
    .evaluateAll(elements =>
      elements
        .filter(
          element =>
            element.clientWidth > 0 &&
            element.scrollWidth > element.clientWidth + 1,
        )
        .map(element => element.textContent),
    );
  assert.deepEqual(
    clipped,
    [],
    'Overlay titles and scale labels must not clip',
  );
}

async function assertOverlay(page, {hasBasal = true} = {}) {
  const overlay = page.getByTestId('day-graph-rich-chart.mixed');
  assert.equal(
    await overlay.locator('svg').count(),
    1,
    'Overlay must use one shared time plot',
  );
  const series = [
    ['iob', 'iob-line-segment'],
    ['cob', 'cob-line-segment'],
  ];
  if (hasBasal) {
    series.push(['basal', 'basal-scheduled-segment']);
  }
  for (const [key, testId] of series) {
    const marks = overlay.getByTestId(testId);
    assert((await marks.count()) > 0, `${key} must be drawn in the overlay`);
    const expected = await page
      .getByTestId('preview-theme-palette')
      .getAttribute(`data-${key}`);
    const colors = await marks.evaluateAll(elements =>
      elements.map(element => element.getAttribute('stroke')),
    );
    assert(
      colors.every(color => color.toLowerCase() === expected.toLowerCase()),
      `${key} must use the selected app theme's series color`,
    );
  }
  const labels = await overlay.innerText();
  for (const unit of ['U/hr', ' U', ' g']) {
    assert(
      labels.includes(unit),
      `Overlay must label ${unit.trim()} separately`,
    );
  }
  assert(
    labels.includes('לכל סדרה סולם משלה'),
    'Overlay must explain the independent scales',
  );
  return overlay;
}

async function tapPlot(page, cdp, plot, fraction, expectedMinutes) {
  await plot.scrollIntoViewIfNeeded();
  const bounds = await plot.boundingBox();
  assert(bounds, 'Touch target must be visible');
  const point = {
    x: bounds.x + 50 + (bounds.width - 65) * fraction,
    y: bounds.y + bounds.height / 2,
  };
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(100);
  assertTime(
    await page.getByTestId('day-graph-rich-chart.tooltipDock').innerText(),
    expectedMinutes,
    'All plots must inspect the same touched time',
  );
  const values = {};
  for (const key of ['iob', 'cob']) {
    values[key] = await page
      .getByTestId(`chart-inspector-value-${key}`)
      .innerText();
    assert(/\d/.test(values[key]), `Selected ${key} must show an actual value`);
  }
  return values;
}

async function scrollAndInspectPlot(page, cdp, plot) {
  await plot.evaluate(element => element.scrollIntoView({block: 'center'}));
  const bounds = await plot.boundingBox();
  assert(bounds, 'Scrolling plot must be visible');
  const scrollPosition = () =>
    plot.evaluate(element => {
      let position = window.scrollY;
      for (
        let parent = element.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (parent !== document.body && parent !== document.documentElement) {
          position += parent.scrollTop;
        }
      }
      return position;
    });
  const point = {
    x: bounds.x + 50 + (bounds.width - 65) / 3,
    y: bounds.y + bounds.height / 2,
  };
  const before = await scrollPosition();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  for (let step = 1; step <= 3; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{...point, y: point.y + step * 25}],
    });
    await page.waitForTimeout(30);
  }
  // Keep supplying samples while changing direction, as a real finger does.
  // Chromium may coalesce the first sample after a native scroll update.
  for (let step = 1; step <= 5; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: point.x + ((bounds.width - 65) / 6) * Math.min(1, step / 3),
          y: point.y + 75 + step * 5,
        },
      ],
    });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(100);
  const scrolledUp = await scrollPosition();
  assert(
    scrolledUp < before - 20,
    'The insulin plot must let its page scroll upward',
  );
  const panel = page.getByTestId('day-graph-rich-chart.tooltipDock');
  assertTime(
    await panel.innerText(),
    22 * 60 + 30,
    'Inspection must follow x during upward scrolling',
  );
  for (let step = 1; step <= 5; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: point.x + ((bounds.width - 65) / 6) * (1 + Math.min(1, step / 3)),
          y: point.y + 100 - step * 17,
        },
      ],
    });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(100);
  assert(
    (await scrollPosition()) > scrolledUp + 20,
    'The same contact must reverse scrolling direction',
  );
  assertTime(
    await panel.innerText(),
    23 * 60,
    'Inspection must continue when scrolling reverses',
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(100);
  assertTime(
    await panel.innerText(),
    23 * 60,
    'Scrolling release must preserve the last inspected time',
  );
}

async function run() {
  mkdirSync('artifacts/chart-mobile', {recursive: true});
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? {channel: process.env.PLAYWRIGHT_CHANNEL}
      : {}),
  });
  try {
    for (const width of [320, 390, 768, 1280]) {
      const page = await browser.newPage({
        viewport: {width, height: 844},
        isMobile: width < 768,
        hasTouch: true,
        deviceScaleFactor: 1,
      });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(
        `${
          process.env.CHART_PREVIEW_URL || 'http://127.0.0.1:5173'
        }/day-graph-preview.html`,
      );
      await page.getByRole('button', {name: 'עברית', exact: true}).click();
      const area = page.getByTestId('day-graph-rich-chart.cgmTouchArea');
      await area.scrollIntoViewIfNeeded();
      const before = await area.boundingBox();
      assert(before, 'Glucose touch surface must be visible');
      const point = {
        x: before.x + 50 + (before.width - 65) / 3,
        y: before.y + before.height / 2,
      };
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [point],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      const panel = page.getByTestId('day-graph-rich-chart.tooltipDock');
      await page.waitForTimeout(100);
      assertTime(
        await panel.innerText(),
        8 * 60,
        'Tapped time should remain after release',
      );
      const after = await area.boundingBox();
      assert.equal(
        after.y,
        before.y,
        'Inspection must not insert content and move the chart',
      );
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [point],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{...point, x: point.x + (before.width - 65) / 12}],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await page.waitForTimeout(100);
      assertTime(
        await panel.innerText(),
        10 * 60,
        'Sideways movement should inspect the expected time',
      );
      if (width < 768) {
        const scrollBefore = await page.evaluate(() => window.scrollY);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [point],
        });
        for (let step = 1; step <= 5; step++) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{x: point.x + step, y: point.y - step * 22}],
          });
          await page.waitForTimeout(20);
        }
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            {x: point.x + (before.width - 65) / 6, y: point.y - 130},
          ],
        });
        await page.waitForTimeout(100);
        assertTime(
          await panel.innerText(),
          12 * 60,
          'After scrolling starts, the same finger must still inspect its current x',
        );
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        await page.waitForTimeout(100);
        assert(
          (await page.evaluate(() => window.scrollY)) > scrollBefore + 20,
          'Vertical swipe over a chart must scroll the page',
        );
        assertTime(
          await panel.innerText(),
          12 * 60,
          'The final inspected time must remain after releasing a scrolling touch',
        );
      }
      assert(await page.getByTestId('day-graph-rich-chart.bolus').isVisible());
      assert(await page.getByTestId('day-graph-rich-chart.basal').isVisible());
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(
        overflow,
        false,
        `${width}px page must not overflow horizontally`,
      );
      await page.screenshot({
        path: `artifacts/chart-mobile/phone-${width}.png`,
        fullPage: true,
      });
      await page.getByTestId('day-graph-range-3').click();
      await page.getByTestId('day-graph-chart-mode-combined').click();
      let overlay = await assertOverlay(page);
      const selectedLoads = await tapPlot(
        page,
        cdp,
        overlay.locator('svg'),
        1 / 3,
        22 * 60,
      );
      await assertNoClipping(page, width);
      if (width < 768) {
        await page.screenshot({
          path: `artifacts/chart-mobile/overlay-${width}.png`,
          fullPage: true,
        });
      }
      await page.getByTestId('day-graph-chart-mode-detailed').click();
      const separateLoads = await tapPlot(
        page,
        cdp,
        page.getByTestId('day-graph-rich-chart.iob').locator('svg'),
        1 / 3,
        22 * 60,
      );
      assert.deepEqual(
        separateLoads,
        selectedLoads,
        'Separate and overlay modes must inspect identical source values',
      );
      if (width < 768) {
        await scrollAndInspectPlot(
          page,
          cdp,
          page.getByTestId('day-graph-rich-chart.iob').locator('svg'),
        );
      }
      await page.getByTestId('day-graph-chart-mode-combined').click();
      await page.getByTestId('chart.cgmGraph.fullscreenButton').click();
      await page.waitForTimeout(350);
      assert.equal(
        await page.getByTestId('day-graph-rich-chart.cgmTouchArea').count(),
        1,
        'Fullscreen must mount one chart',
      );
      assert.equal(
        await page
          .getByTestId('day-graph-range-3')
          .getAttribute('aria-pressed'),
        'true',
      );
      overlay = await assertOverlay(page);
      const fullscreenLoads = await tapPlot(
        page,
        cdp,
        overlay.locator('svg'),
        1 / 3,
        22 * 60,
      );
      assert.deepEqual(
        fullscreenLoads,
        selectedLoads,
        'Fullscreen must inspect the same source values',
      );
      if (width < 768) {
        await scrollAndInspectPlot(page, cdp, overlay.locator('svg'));
      }
      assert.equal(
        await page
          .getByTestId('day-graph-chart-mode-combined')
          .getAttribute('aria-pressed'),
        'true',
      );
      await page.screenshot({
        path: `artifacts/chart-mobile/fullscreen-${width}.png`,
        fullPage: true,
      });
      await page.getByTestId('day-graph-fullscreen-close').click();
      assert.equal(
        await page
          .getByTestId('day-graph-range-3')
          .getAttribute('aria-pressed'),
        'true',
      );
      assert.deepEqual(errors, [], 'No browser runtime errors');
      // Exercise the actual application theme registry while preserving view state.
      const chartShell = page.getByTestId('day-graph-rich-chart').first();
      const surfaces = new Set();
      for (const themeId of [
        'darkFocus',
        'sunsetGlow',
        'highContrastRisk',
        'calmBlue',
      ]) {
        await page.getByTestId(`preview-theme-${themeId}`).click();
        const surface = await chartShell.evaluate(
          element => getComputedStyle(element).backgroundColor,
        );
        surfaces.add(surface);
        assert.equal(
          await page
            .getByTestId('day-graph-range-3')
            .getAttribute('aria-pressed'),
          'true',
          'Changing the app theme must retain the time range',
        );
        assert.equal(
          await page
            .getByTestId('day-graph-chart-mode-combined')
            .getAttribute('aria-pressed'),
          'true',
          'Changing the app theme must retain overlay mode',
        );
        await assertOverlay(page);
        await assertNoClipping(page, width);
        if (width < 768) {
          await page.screenshot({
            path: `artifacts/chart-mobile/overlay-${themeId}-${width}.png`,
            fullPage: true,
          });
        }
        await page.getByTestId('chart.cgmGraph.fullscreenButton').click();
        await page.waitForTimeout(350);
        assert.equal(
          await chartShell.evaluate(
            element => getComputedStyle(element).backgroundColor,
          ),
          surface,
          'Fullscreen must inherit the active application theme',
        );
        await assertOverlay(page);
        if (themeId === 'darkFocus' && width === 390) {
          await page.screenshot({
            path: 'artifacts/chart-mobile/fullscreen-dark-390.png',
            fullPage: true,
          });
        }
        await page.getByTestId('day-graph-fullscreen-close').click();
      }
      assert(surfaces.size >= 3, 'Theme changes must update the chart surface');
      await page.getByTestId('preview-scenario-loads-only').click();
      overlay = await assertOverlay(page, {hasBasal: false});
      assert.equal(
        await page.getByTestId('day-graph-rich-chart.glucose').count(),
        0,
        'Independent loads must never invent glucose',
      );
      assert(
        await page.getByTestId('day-graph-rich-chart.glucoseEmpty').isVisible(),
      );
      const independentLoads = await tapPlot(
        page,
        cdp,
        overlay.locator('svg'),
        1 / 3,
        22 * 60,
      );
      assert.deepEqual(
        independentLoads,
        selectedLoads,
        'Removing glucose must preserve independently acquired load readings',
      );
      await assertNoClipping(page, width);
      if (width < 768) {
        await page.screenshot({
          path: `artifacts/chart-mobile/independent-loads-${width}.png`,
          fullPage: true,
        });
      }
      await page.getByTestId('preview-scenario-unavailable').click();
      assert(await page.getByTestId('day-graph-source-status').isVisible());
      assert.equal(
        await page
          .getByTestId('day-graph-rich-chart.mixed')
          .locator('svg')
          .count(),
        0,
        'Failed sources must not draw fabricated zero series',
      );
      await assertNoClipping(page, width);
      if (width < 768) {
        await page.screenshot({
          path: `artifacts/chart-mobile/unavailable-${width}.png`,
          fullPage: true,
        });
      }
      assert.deepEqual(
        errors,
        [],
        'Theme changes must not produce browser errors',
      );
      console.log(
        `PASS ${width}px: Hebrew, tap/release, drag, shared separate/overlay/fullscreen inspection, independent loads, source errors, no clipping, all four app themes, no runtime errors`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
