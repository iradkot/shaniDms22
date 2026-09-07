/* eslint-env node, browser, es2022 */
// Uses synthetic data only. Start yarn web --host 127.0.0.1 --port 5176.
const assert = require('node:assert/strict');
const {mkdirSync, writeFileSync} = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.DAILY_OVERVIEW_PREVIEW_URL || 'http://127.0.0.1:5176/daily-overview-preview.html';
const output = 'artifacts/daily-overview';
mkdirSync(output, {recursive: true});
const defaultOrder = ['ranges', 'mean', 'glucose', 'insulin', 'coverage'];
const pageOrder = page => page.getByTestId('daily-overview-content').locator(':scope > [data-testid^="daily-overview-card-"]').evaluateAll(nodes => nodes.map(node => node.dataset.testid.replace('daily-overview-card-', '')));
async function ready(page) { await page.getByTestId('daily-overview-content').waitFor(); }
async function noClipping(page, label) {
  const clipped = await page.getByTestId('daily-overview-view').locator('div').evaluateAll(nodes => nodes.filter(node => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 2 && getComputedStyle(node).overflowX !== 'hidden').map(node => node.textContent.slice(0, 80)));
  assert.deepEqual(clipped, [], `${label}: visible content must fit`);
}
async function touchDrag(page, cdp, id, endY, {hold = 0, cancel = false} = {}) {
  const handle = page.getByTestId(`daily-overview-drag-${id}`);
  const box = await handle.boundingBox();
  assert(box, 'Drag handle is visible');
  const point = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  assert(await handle.evaluate((node, coordinate) =>
    document.elementFromPoint(coordinate.x, coordinate.y) === node, point),
    'Touch must start on the visible drag handle');
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point]});
  for (let step = 1; step <= 14; step++) {
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: point.x, y: point.y + (endY - point.y) * step / 14}]});
    await page.waitForTimeout(16);
  }
  if (hold) { await page.waitForTimeout(hold); }
  await cdp.send('Input.dispatchTouchEvent', {type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: []});
  await page.waitForTimeout(200);
}
(async () => {
  const browser = await chromium.launch({headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome'});
  const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const report = [];
  try {
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({width, height: 844});
      await page.goto(url);
      await ready(page);
      await noClipping(page, `view ${width}`);
      assert.equal(await page.getByTestId('daily-overview-insulin-basal').innerText(), '32.06 U');
      await page.screenshot({path: `${output}/view-${width}.png`});
      await page.getByTestId('daily-overview-customize').click();
      for (const style of ['ring', 'bar', 'list']) {
        await page.getByTestId(`daily-overview-style-${style}`).click();
        assert.equal(await page.getByTestId('daily-overview-card-ranges').getByTestId(`daily-overview-range-visual-${style}`).count(), 1);
        await noClipping(page, `editor ${width} ${style}`);
      }
      await page.getByTestId('daily-overview-style-ring').click();
      await page.screenshot({path: `${output}/editor-${width}.png`});
      await page.getByTestId('daily-overview-cancel').click();
      report.push(`RTL view/editor, all three styles fit at ${width}px`);
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(url);
    await ready(page);
    await page.getByTestId('daily-overview-customize').click();
    await page.getByTestId('daily-overview-style-bar').click();
    const viewport = page.getByTestId('daily-overview-reorder-list');
    await viewport.scrollIntoViewIfNeeded();
    const bounds = await viewport.boundingBox();
    assert(bounds);
    const beforeScroll = await page.getByTestId('daily-overview-view').evaluate(node => node.scrollTop);
    await touchDrag(page, cdp, 'ranges', bounds.y + bounds.height - 10, {hold: 1000});
    assert.deepEqual(await pageOrder(page), ['mean', 'glucose', 'insulin', 'coverage', 'ranges']);
    assert.equal(await page.getByTestId('daily-overview-view').evaluate(node => node.scrollTop), beforeScroll, 'Dragging handle must not scroll the outer page');
    assert((await viewport.evaluate(node => node.scrollTop)) > 100, 'A held finger autoscrolls the inner list');
    await page.screenshot({path: `${output}/touch-reordered.png`});
    await page.getByTestId('daily-overview-save').click();
    await page.getByTestId('daily-overview-customize').waitFor();
    await page.reload();
    await ready(page);
    assert.deepEqual(await pageOrder(page), ['mean', 'glucose', 'insulin', 'coverage', 'ranges']);
    assert.equal(await page.getByTestId('daily-overview-range-visual-bar').count(), 1);
    report.push('Real touch drag moves first to last with edge autoscroll; saves across reload');

    await page.getByTestId('daily-overview-customize').click();
    await viewport.scrollIntoViewIfNeeded();
    const cancellationBounds = await viewport.boundingBox();
    await touchDrag(page, cdp, 'mean', cancellationBounds.y + 250, {cancel: true});
    assert.deepEqual(await pageOrder(page), ['mean', 'glucose', 'insulin', 'coverage', 'ranges']);
    await page.getByTestId('daily-overview-drag-mean').focus();
    await page.keyboard.press('ArrowDown');
    assert.deepEqual(await pageOrder(page), ['glucose', 'mean', 'insulin', 'coverage', 'ranges']);
    await page.getByTestId('daily-overview-cancel').click();
    assert.deepEqual(await pageOrder(page), ['mean', 'glucose', 'insulin', 'coverage', 'ranges']);
    report.push('Touch cancellation, keyboard reordering and Cancel preserve the saved design');

    for (const scenario of ['empty', 'partial']) {
      await page.goto(`${url}?scenario=${scenario}`);
      await ready(page);
      await noClipping(page, scenario);
      if (scenario === 'empty') {
        assert.equal(await page.getByTestId('daily-overview-insulin-total').count(), 0);
        assert.equal(await page.getByTestId('daily-overview-range-visual-ring').count(), 0);
      }
      await page.screenshot({path: `${output}/${scenario}.png`});
    }
    await page.goto(`${url}?locale=en`);
    await ready(page);
    await noClipping(page, 'English');
    await page.getByTestId('daily-overview-customize').click();
    await page.getByTestId('daily-overview-reset').click();
    await page.getByTestId('daily-overview-save').click();
    await page.getByTestId('daily-overview-customize').waitFor();
    assert.deepEqual(await pageOrder(page), defaultOrder);
    assert.deepEqual(errors, [], 'No browser runtime errors');
    report.push('Empty/partial data, English, reset and no browser runtime errors');
    writeFileSync(`${output}/verification.json`, JSON.stringify({passed: true, checks: report, physicalDeviceFrameRateMeasured: false}, null, 2));
    console.log(report.join('\n'));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
