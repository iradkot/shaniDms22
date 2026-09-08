/* eslint-env node, browser, es2022 */
// Synthetic browser QA. Run against Vite; PLAYWRIGHT_MODULE can point to a bundled package.
const assert = require('node:assert/strict');
const {mkdirSync} = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge'});
  mkdirSync('artifacts/glucose-forecast', {recursive: true});
  try {
    for (const [width, language, dark] of [[390, 'he', false], [1280, 'en', false], [390, 'he', true]]) {
      const page = await browser.newPage({viewport: {width, height: 900}});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${process.env.PREVIEW_URL || 'http://127.0.0.1:5178'}/day-graph-preview.html?forecast=1`);
      if (language === 'he') {
        await page.getByRole('button', {name: 'עברית', exact: true}).click();
      }
      if (dark) {
        await page.getByTestId('preview-theme-darkFocus').click();
      }
      const card = page.getByTestId('glucose-forecast-card');
      await card.waitFor();
      await page.getByTestId('day-graph-show-forecast').click();
      assert.equal(await page.getByTestId('glucose-forecast-layer').count(), 1);
      for (const id of ['loop', 'nightscout', 'personalized', 'ensemble']) {
        assert.equal(await page.getByTestId(`glucose-forecast-line-${id}`).count(), 1);
      }
      assert.equal(await page.getByTestId('glucose-forecast-band-ensemble').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      assert.deepEqual(await card.locator('div').evaluateAll(elements => elements.filter(element =>
        element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1).map(element => element.textContent)), []);
      assert.deepEqual(errors, []);
      await page.screenshot({path: `artifacts/glucose-forecast/${language}-${width}${dark ? '-dark' : ''}.png`, fullPage: true});
      console.log(`Forecast preview ${language} ${width}px${dark ? ' dark' : ''}: four curves, interval, no overflow or page errors.`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
