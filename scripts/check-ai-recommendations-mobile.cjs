/* eslint-env node, browser, es2022 */
// Exercise the production AI view with synthetic, local-only runtime data.
// The Vite server must be started with SHANI_RELEASE_CHANNEL=development to
// inspect experimental now/meal controls. Default pilot builds hide them.
const assert = require('node:assert/strict');
const {mkdirSync, writeFileSync} = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url =
  process.env.AI_PREVIEW_URL ||
  'http://127.0.0.1:5176/ai-recommendations-preview.html';
const output = 'artifacts/ai-recommendations';
mkdirSync(output, {recursive: true});

async function noClipping(page, label) {
  const overflow = await page
    .locator(
      '[data-testid="ai-analyst-module"], [data-testid="ai-conversation"]',
    )
    .locator('div')
    .evaluateAll(nodes =>
      nodes
        .filter(node => {
          const style = getComputedStyle(node);
          return (
            node.clientWidth > 0 &&
            node.scrollWidth > node.clientWidth + 2 &&
            !['hidden', 'auto', 'scroll'].includes(style.overflowX)
          );
        })
        .map(node => ({
          text: node.textContent.slice(0, 70),
          width: node.clientWidth,
          scroll: node.scrollWidth,
        })),
    );
  assert.deepEqual(overflow, [], `${label}: content fits the viewport`);
  const smallControls = await page
    .locator('[role="button"], [role="radio"], [role="switch"]')
    .evaluateAll(nodes =>
      nodes
        .filter(node => node.getBoundingClientRect().height < 44)
        .map(node => node.textContent),
    );
  assert.deepEqual(
    smallControls,
    [],
    `${label}: controls have 44px touch targets`,
  );
}

async function screenshot(page, name) {
  const screen = page.locator(
    '[data-testid="ai-analyst-module"], [data-testid="ai-conversation"]',
  );
  const viewport = page.viewportSize();
  const height = await screen.evaluate(node => node.scrollHeight);
  await page.setViewportSize({
    width: viewport.width,
    height: Math.max(844, height + 40),
  });
  await screen.evaluate(node => {
    node.scrollTop = 0;
  });
  await page.screenshot({path: `${output}/${name}.png`});
  await page.setViewportSize(viewport);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || 'chrome',
  });
  const context = await browser.newContext({
    viewport: {width: 360, height: 844},
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const locale of ['he', 'en']) {
      for (const width of [360, 768]) {
        await page.setViewportSize({width, height: 844});
        await page.goto(`${url}?locale=${locale}`);
        await page.getByTestId('ai-recommend-now').waitFor();
        await noClipping(page, `${locale} ${width} landing`);
        await screenshot(page, `${locale}-${width}-landing`);
        await page.getByTestId('ai-recommend-meal').tap();
        assert.equal(
          await page
            .getByTestId('ai-meal-submit')
            .getAttribute('aria-disabled'),
          'true',
        );
        await page.getByTestId('ai-meal-size-small').tap();
        await page.getByTestId('ai-meal-size-large').tap();
        await noClipping(page, `${locale} ${width} meal`);
        await screenshot(page, `${locale}-${width}-meal`);
        await page.getByTestId('ai-meal-submit').tap();
        await page.getByTestId('ai-conversation').waitFor();
        assert.deepEqual(
          JSON.parse(
            await page.getByTestId('ai-preview-request').textContent(),
          ),
          {kind: 'meal', mealSize: 'large'},
        );
        assert.equal(
          await page
            .getByTestId('ai-context-toggle')
            .getAttribute('aria-expanded'),
          'false',
        );
        await page.getByTestId('ai-feedback-helpful-0').tap();
        await page.getByTestId('ai-feedback-reason-0-practical').tap();
        await page
          .getByTestId('ai-feedback-comment-0')
          .fill(
            locale === 'he' ? 'אהבתי שההמלצה פשוטה' : 'Simple suggestions help',
          );
        await page.getByTestId('ai-feedback-save-0').tap();
        await noClipping(page, `${locale} ${width} response and feedback`);
        await screenshot(page, `${locale}-${width}-feedback`);
        checks.push(
          `${locale} ${width}px: landing, meal size, collapsed evidence, response and feedback; no clipping; accessible touch targets`,
        );
      }
      await page.setViewportSize({width: 360, height: 844});
      await page.goto(`${url}?locale=${locale}`);
      await page.getByTestId('ai-recommend-guided').tap();
      for (const [step, value] of [
        [0, 'monthly'],
        [1, 'care-team'],
        [2, 'fewer-lows'],
        [3, 'brief'],
      ]) {
        await page.getByTestId(`ai-guided-step-${step}-${value}`).tap();
        await noClipping(page, `${locale} guided step ${step}`);
        await page.getByTestId('ai-guided-next').tap();
      }
      await page
        .getByTestId('ai-guided-notes')
        .fill(
          locale === 'he' ? 'חשוב לי לשפר את הלילות' : 'Please focus on nights',
        );
      await screenshot(page, `${locale}-360-guided-review`);
      await page.getByTestId('ai-guided-change-1').tap();
      await page.getByTestId('ai-guided-step-1-routine').tap();
      for (let i = 0; i < 3; i++) {
        await page.getByTestId('ai-guided-next').tap();
      }
      await page.getByTestId('ai-guided-submit').tap();
      await page.getByTestId('ai-conversation').waitFor();
      const request = JSON.parse(
        await page.getByTestId('ai-preview-request').textContent(),
      );
      assert.equal(request.focus, 'routine');
      assert.equal(request.horizon, 'monthly');
      assert.equal(request.goal, 'fewer-lows');
      await page.getByTestId('ai-memory-toggle').tap();
      await page
        .getByTestId('ai-memory-instructions')
        .fill('Vegetarian, short answers');
      await page.getByTestId('ai-memory-save').tap();
      await noClipping(page, `${locale} memory`);
      await screenshot(page, `${locale}-360-memory`);
      await page.getByTestId('ai-memory-clear').tap();
      assert.equal(
        await page.getByTestId('ai-memory-instructions').inputValue(),
        '',
      );
      checks.push(
        `${locale} 360px: guided choices, edit/review/submit, editable memory and clear`,
      );
    }
    assert.deepEqual(errors, [], 'No browser runtime errors');
    writeFileSync(
      `${output}/verification.json`,
      JSON.stringify({passed: true, checks, syntheticDataOnly: true}, null, 2),
    );
    console.log(checks.join('\n'));
  } catch (error) {
    await page.screenshot({path: `${output}/failure.png`});
    writeFileSync(
      `${output}/failure.json`,
      JSON.stringify(
        {
          message: error.message,
          errors,
          text: await page.locator('body').innerText(),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
