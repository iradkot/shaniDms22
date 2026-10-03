/* eslint-env node, browser, es2022 */
// Synthetic fixtures only. Start yarn web --host 127.0.0.1 --port 5176.
const assert = require('node:assert/strict');
const {mkdirSync, writeFileSync} = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url =
  process.env.TRENDS_OVERVIEW_PREVIEW_URL ||
  'http://127.0.0.1:5176/trends-overview-preview.html';
const output = 'artifacts/trends-overview';
mkdirSync(output, {recursive: true});

async function ready(page) {
  await page.getByTestId('trends-overview-coverage').waitFor();
}

async function noClipping(page, label) {
  const clipped = await page
    .getByTestId('trends-overview-view')
    .locator('div')
    .evaluateAll(nodes =>
      nodes
        .filter(node => {
          const overflow = getComputedStyle(node).overflowX;
          return (
            node.clientWidth > 0 &&
            node.scrollWidth > node.clientWidth + 2 &&
            !['hidden', 'auto', 'scroll'].includes(overflow)
          );
        })
        .map(node => ({
          text: node.textContent.slice(0, 100),
          width: node.clientWidth,
          scroll: node.scrollWidth,
        })),
    );
  assert.deepEqual(clipped, [], `${label}: visible content must fit`);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || 'chrome',
  });
  const context = await browser.newContext({
    viewport: {width: 390, height: 844},
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const checks = [];
  try {
    for (const locale of ['he', 'en']) {
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({width, height: 844});
        await page.goto(`${url}?locale=${locale}`);
        await ready(page);
        assert.equal(
          await page
            .getByTestId('trends-range-14')
            .getAttribute('aria-selected'),
          'true',
        );
        await noClipping(page, `${locale} ${width}`);
        await page.screenshot({path: `${output}/${locale}-view-${width}.png`});
        await page
          .getByTestId('trends-overview-daily')
          .scrollIntoViewIfNeeded();
        await page.screenshot({path: `${output}/${locale}-daily-${width}.png`});
        const initialDay = await page
          .getByTestId('trends-selected-day')
          .innerText();
        await page.getByTestId('trends-days-previous').tap();
        assert.notEqual(
          await page.getByTestId('trends-selected-day').innerText(),
          initialDay,
        );
        await page.getByTestId('trends-days-next').tap();
        assert.equal(
          await page.getByTestId('trends-selected-day').innerText(),
          initialDay,
        );
        await page.getByTestId('trends-day-11').tap();
        assert(
          (await page.getByTestId('trends-selected-day').innerText()).includes(
            locale === 'he'
              ? 'אין קריאות ביום הזה'
              : 'No readings for this day',
          ),
        );
        await page.getByTestId('trends-day-12').tap();
        assert.equal(
          await page.getByTestId('trends-day-12').getAttribute('aria-pressed'),
          'true',
        );
        assert(
          !(await page.getByTestId('trends-selected-day').innerText()).includes(
            locale === 'he'
              ? 'אין קריאות ביום הזה'
              : 'No readings for this day',
          ),
        );
        await page.getByTestId('trends-range-30').tap();
        await ready(page);
        await noClipping(page, `${locale} ${width} 30 days`);
        await page.getByTestId('trends-range-7').tap();
        await ready(page);
        assert.equal(await page.getByTestId('trends-overview-gmi').count(), 0);
        assert.equal(
          await page.getByTestId('trends-comparison-mean-delta').count(),
          0,
        );
        checks.push(
          `${locale} ${width}px: layout, touch daily selection and paging, 7/14/30 days, short-period quality gates`,
        );
      }
    }
    await page.setViewportSize({width: 390, height: 844});
    for (const scenario of ['partial', 'empty']) {
      await page.goto(`${url}?scenario=${scenario}&gri=1`);
      await ready(page);
      await noClipping(page, scenario);
      assert.equal(await page.getByTestId('trends-overview-gmi').count(), 0);
      assert.equal(await page.getByTestId('trends-overview-gri').count(), 0);
      assert.equal(
        await page.getByTestId('trends-comparison-mean-delta').count(),
        0,
      );
      if (scenario === 'empty') {
        assert.equal(
          await page.getByTestId('trends-overview-range-ring').count(),
          0,
        );
        assert.equal(
          await page.getByTestId('trends-overview-daily').count(),
          0,
        );
      }
      await page.screenshot({path: `${output}/${scenario}.png`});
      checks.push(
        `${scenario}: explicit quality state, no representative GMI/GRI or deltas`,
      );
    }
    await page.goto(`${url}?gri=1`);
    await ready(page);
    assert.equal(await page.getByTestId('trends-overview-gri').count(), 1);
    const scroller = page.getByTestId('trends-overview-view');
    const height = await scroller.evaluate(node => node.scrollHeight);
    await page.setViewportSize({width: 390, height: height + 30});
    await page.screenshot({path: `${output}/full-view-390.png`});
    assert.deepEqual(errors, [], 'No browser runtime errors');
    checks.push(
      'Representative GRI requires opt-in; no browser runtime errors',
    );
    writeFileSync(
      `${output}/verification.json`,
      JSON.stringify(
        {passed: true, checks, physicalDeviceFrameRateMeasured: false},
        null,
        2,
      ),
    );
    console.log(checks.join('\n'));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
