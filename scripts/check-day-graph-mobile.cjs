/* eslint-env node, browser, es2022 */
// Run against `yarn web --host 127.0.0.1` with Playwright installed, or set
// PLAYWRIGHT_MODULE to an existing Playwright package. Uses synthetic data only.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
function assertTime(text, expectedMinutes, message) {
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  assert(match, 'Inspector must expose a selected time');
  assert(
    Math.abs(Number(match[1]) * 60 + Number(match[2]) - expectedMinutes) <= 1,
    message,
  );
}

async function run() {
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
          8 * 60,
          'Vertical scrolling must not scrub the selected time',
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
          'Changing the app theme must retain compact mode',
        );
        await page.getByTestId('chart.cgmGraph.fullscreenButton').click();
        await page.waitForTimeout(350);
        assert.equal(
          await chartShell.evaluate(
            element => getComputedStyle(element).backgroundColor,
          ),
          surface,
          'Fullscreen must inherit the active application theme',
        );
        if (themeId === 'darkFocus' && width === 390) {
          await page.screenshot({
            path: 'artifacts/chart-mobile/fullscreen-dark-390.png',
            fullPage: true,
          });
        }
        await page.getByTestId('day-graph-fullscreen-close').click();
      }
      assert(surfaces.size >= 3, 'Theme changes must update the chart surface');
      assert.deepEqual(
        errors,
        [],
        'Theme changes must not produce browser errors',
      );
      console.log(
        `PASS ${width}px: Hebrew, tap/release, drag, stable layout, lanes, no overflow, fullscreen state, all four app themes, no runtime errors`,
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
