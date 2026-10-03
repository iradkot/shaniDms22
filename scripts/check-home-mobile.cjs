/* eslint-env node, browser, es2022 */
// Synthetic development preview of the production PersonalHomeView only.
const assert = require('node:assert/strict');
const {mkdirSync, writeFileSync} = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url =
  process.env.HOME_PREVIEW_URL || 'http://127.0.0.1:5176/home-preview.html';
const output = 'artifacts/home';
const storageKey = 'shani.home.development-preview';
const widgetIds = [
  'glucose-graph',
  'time-in-range',
  'daily-insulin',
  'weekly-glucose',
  'weekly-insulin',
  'chat',
];
const defaultIds = ['glucose-graph', 'daily-insulin', 'weekly-glucose', 'chat'];
mkdirSync(output, {recursive: true});

async function ready(page) {
  await page.getByTestId('personal-home-view').waitFor();
  await page.waitForFunction(() => {
    const text =
      document.querySelector('[data-testid="home-widget-grid"]')?.textContent ||
      '';
    return !text.includes('Loading data…') && !text.includes('טוען נתונים…');
  });
}

async function fresh(page, query = '') {
  await page.goto(url);
  await page.evaluate(key => localStorage.removeItem(key), storageKey);
  await page.goto(`${url}${query}`);
  await ready(page);
}

const order = page =>
  page
    .getByTestId('home-widget-grid')
    .locator('[data-testid^="home-widget-"]')
    .evaluateAll(nodes =>
      nodes.map(node => node.dataset.testid.replace('home-widget-', '')),
    );

async function noClipping(page, label) {
  const clipped = await page
    .getByTestId('product-home')
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
          text: node.textContent.slice(0, 110),
          width: node.clientWidth,
          scroll: node.scrollWidth,
        })),
    );
  assert.deepEqual(clipped, [], `${label}: visible content must fit`);
}

async function enableAll(page) {
  for (const id of widgetIds) {
    const checkbox = page.getByTestId(`home-toggle-${id}`);
    if ((await page.getByTestId(`home-widget-${id}`).count()) === 0) {
      await checkbox.tap();
    }
  }
  await ready(page);
}

async function touchDrag(page, cdp, id, endY, {hold = 0, cancel = false} = {}) {
  const handle = page.getByTestId(`home-drag-${id}`);
  const bounds = await handle.boundingBox();
  assert(bounds, 'Drag handle has a visible bounding box');
  const point = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  assert(
    await handle.evaluate(
      (node, p) => document.elementFromPoint(p.x, p.y) === node,
      point,
    ),
    'Touch starts on visible drag handle',
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  for (let step = 1; step <= 16; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x: point.x, y: point.y + ((endY - point.y) * step) / 16}],
    });
    await page.waitForTimeout(16);
  }
  if (hold) {
    await page.waitForTimeout(hold);
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(180);
}

async function fullScreenshot(page, filename) {
  const height = await page
    .getByTestId('personal-home-view')
    .evaluate(node => node.scrollHeight);
  const current = page.viewportSize();
  await page.setViewportSize({width: current.width, height: height + 120});
  await page.getByTestId('personal-home-view').evaluate(node => {
    node.scrollTop = 0;
  });
  await page.screenshot({path: `${output}/${filename}`});
  await page.setViewportSize(current);
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
  const cdp = await context.newCDPSession(page);
  const errors = [];
  const checks = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const locale of ['he', 'en']) {
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({width, height: 844});
        await fresh(page, `?locale=${locale}`);
        assert.deepEqual(await order(page), defaultIds);
        await noClipping(page, `${locale} ${width} view`);
        await page.screenshot({path: `${output}/${locale}-view-${width}.png`});
        await page.getByTestId('home-customize').tap();
        for (const id of widgetIds) {
          const checkbox = page.getByTestId(`home-toggle-${id}`);
          assert.equal(
            await checkbox.getAttribute('aria-checked'),
            String((await page.getByTestId(`home-widget-${id}`).count()) > 0),
          );
          if ((await page.getByTestId(`home-widget-${id}`).count()) > 0) {
            await checkbox.tap();
          }
          assert.equal(
            await page.getByTestId(`home-widget-${id}`).count(),
            0,
            `${id} hides in live preview`,
          );
          assert.equal(await checkbox.getAttribute('aria-checked'), 'false');
          await checkbox.tap();
          assert.equal(await checkbox.getAttribute('aria-checked'), 'true');
          assert.equal(
            await page.getByTestId(`home-widget-${id}`).count(),
            1,
            `${id} returns in live preview`,
          );
        }
        await ready(page);
        assert.deepEqual(await order(page), widgetIds);
        for (const [window, start] of [
          [6, '12:30'],
          [12, '06:30'],
          ['full-day', '00:00'],
        ]) {
          await page.getByTestId(`home-window-${window}`).tap();
          assert.equal(
            await page
              .getByTestId(`home-window-${window}`)
              .getAttribute('aria-pressed'),
            'true',
          );
          const axis = await page
            .getByTestId('home-widget-glucose-graph')
            .locator('svg text')
            .allTextContents();
          assert.equal(
            axis[axis.length - 2],
            start,
            `The ${window} choice changes the live chart period`,
          );
          assert.equal(axis[axis.length - 1], '18:30');
          await noClipping(page, `${locale} ${width} ${window}`);
        }
        await page.getByTestId('home-editor').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${output}/${locale}-editor-${width}.png`,
        });
        await page.getByTestId('home-save').tap();
        await page.getByTestId('home-customize').waitFor();
        await page.reload();
        await ready(page);
        assert.deepEqual(
          await order(page),
          widgetIds,
          'Visible widgets persist after reload',
        );
        const saved = await page.evaluate(
          key => JSON.parse(localStorage.getItem(key)),
          storageKey,
        );
        assert.equal(saved.glucoseWindowHours, 'full-day');
        await fullScreenshot(page, `${locale}-full-view-${width}.png`);
        if (locale === 'he' && width === 390) {
          const insulinDays = page
            .getByTestId('home-weekly-insulin-bars')
            .locator('[data-testid^="home-weekly-insulin-day-"]');
          for (const index of [0, 3]) {
            const day = insulinDays.nth(index);
            const timestamp = (await day.getAttribute('data-testid')).replace(
              'home-weekly-insulin-day-',
              '',
            );
            await day.tap();
            assert.equal(
              await page.getByTestId('home-preview-opened').innerText(),
              `weekly-insulin:${timestamp}`,
              'Daily insulin navigation retains the tapped date, including a missing day',
            );
          }
          checks.push(
            'Weekly insulin bars open the correct selected date, including a day with no data',
          );
        }
        await page.getByTestId('home-customize').tap();
        await page.getByTestId('home-toggle-chat').tap();
        await page.getByTestId('home-window-6').tap();
        await page.getByTestId('home-cancel').tap();
        assert.deepEqual(
          await order(page),
          widgetIds,
          'Cancel restores saved visibility',
        );
        assert.deepEqual(
          await page.evaluate(
            key => JSON.parse(localStorage.getItem(key)),
            storageKey,
          ),
          saved,
          'Cancel never persists the draft',
        );
        checks.push(
          `${locale} ${width}px: all widgets toggle live; 6h/12h/full day affect chart; save/reload/cancel preserve choices; no clipping`,
        );
      }
    }

    await page.setViewportSize({width: 390, height: 844});
    await fresh(page);
    await page.getByTestId('home-customize').tap();
    await enableAll(page);
    const viewport = page.getByTestId('home-reorder-list');
    await viewport.scrollIntoViewIfNeeded();
    const bounds = await viewport.boundingBox();
    assert(bounds);
    const outer = page.getByTestId('personal-home-view');
    const outerBefore = await outer.evaluate(node => node.scrollTop);
    await touchDrag(page, cdp, 'glucose-graph', bounds.y + bounds.height - 8, {
      hold: 1300,
    });
    const draggedOrder = [...widgetIds.slice(1), widgetIds[0]];
    assert.deepEqual(
      await order(page),
      draggedOrder,
      'Touch drag moves the first card to the last position',
    );
    assert.equal(
      await outer.evaluate(node => node.scrollTop),
      outerBefore,
      'Outer page stays still during touch drag',
    );
    assert(
      (await viewport.evaluate(node => node.scrollTop)) > 200,
      'Holding a finger at the edge autoscrolls the reorder list',
    );
    await page.screenshot({path: `${output}/touch-reordered.png`});
    await page.getByTestId('home-save').tap();
    await page.getByTestId('home-customize').waitFor();
    await page.reload();
    await ready(page);
    assert.deepEqual(
      await order(page),
      draggedOrder,
      'Touch order survives reload',
    );
    checks.push(
      'CDP real touch: first-to-last reorder with edge autoscroll, stable outer page, save and reload',
    );

    await page.getByTestId('home-customize').tap();
    await viewport.scrollIntoViewIfNeeded();
    const cancelBounds = await viewport.boundingBox();
    await touchDrag(page, cdp, 'time-in-range', cancelBounds.y + 250, {
      cancel: true,
    });
    assert.deepEqual(
      await order(page),
      draggedOrder,
      'Touch cancellation does not apply a draft reorder',
    );
    await page.getByTestId('home-drag-time-in-range').focus();
    await page.keyboard.press('ArrowDown');
    assert.deepEqual(await order(page), [
      'daily-insulin',
      'time-in-range',
      ...draggedOrder.slice(2),
    ]);
    await page.getByTestId('home-cancel').tap();
    assert.deepEqual(
      await order(page),
      draggedOrder,
      'Cancel restores the saved touch order',
    );
    checks.push(
      'Touch cancellation and keyboard ArrowDown work; Cancel preserves saved order',
    );

    await page.getByTestId('home-tab-modules').tap();
    assert.equal(
      await page.getByTestId('home-tab-modules').getAttribute('aria-selected'),
      'true',
    );
    await page.getByTestId('home-preview-tools').waitFor();
    await page.getByTestId('home-tab-personal').tap();
    await ready(page);
    await page.getByTestId('home-customize').tap();
    await page.getByTestId('home-mode-modules').tap();
    assert.equal(
      await page.getByTestId('home-mode-modules').getAttribute('aria-pressed'),
      'true',
    );
    await page.getByTestId('home-modules-preview').waitFor();
    await page.getByTestId('home-save').tap();
    await page.getByTestId('home-preview-tools').waitFor();
    await page.reload();
    await page.getByTestId('home-preview-tools').waitFor();
    await page.getByTestId('home-tab-personal').tap();
    await ready(page);
    assert.deepEqual(await order(page), draggedOrder);
    checks.push(
      'All tools tab and saved default mode work; personal layout remains available',
    );

    for (const scenario of ['empty', 'partial', 'error']) {
      await fresh(page, `?scenario=${scenario}`);
      await page.getByTestId('home-customize').tap();
      await enableAll(page);
      await page.getByTestId('home-save').tap();
      await ready(page);
      await noClipping(page, scenario);
      if (scenario !== 'partial') {
        assert.equal(await page.getByTestId('home-glucose-value').count(), 0);
      }
      if (scenario === 'error') {
        assert(
          (
            await page.getByTestId('home-widget-glucose-graph').innerText()
          ).includes('לא הצלחנו לטעון את הנתונים'),
        );
      }
      await fullScreenshot(page, `${scenario}.png`);
      checks.push(
        `${scenario}: all cards have explicit data/quality states without clipping`,
      );
    }
    await fresh(page, '?scenario=save-error');
    await page.getByTestId('home-customize').tap();
    await page.getByTestId('home-toggle-weekly-insulin').tap();
    await page.getByTestId('home-save').tap();
    await page.getByTestId('home-save-error').waitFor();
    assert.equal(
      await page.getByTestId('home-widget-weekly-insulin').count(),
      1,
    );
    assert.equal(
      await page.evaluate(key => localStorage.getItem(key), storageKey),
      null,
    );
    await page.screenshot({path: `${output}/save-error.png`});
    await page.getByTestId('home-cancel').tap();
    assert.deepEqual(await order(page), defaultIds);
    checks.push(
      'Save failure retains the editable draft, preserves storage, and allows Cancel',
    );

    await fresh(page, '?scenario=slow-save');
    await page.getByTestId('home-customize').tap();
    await page.getByTestId('home-save').tap();
    assert.equal(
      await page.getByTestId('home-save').getAttribute('aria-busy'),
      'true',
    );
    await page.getByTestId('home-customize').waitFor();
    checks.push(
      'Save exposes aria-busy while the persistence request is pending',
    );

    await page.getByTestId('home-customize').tap();
    for (const id of defaultIds) {
      await page.getByTestId(`home-toggle-${id}`).tap();
    }
    assert.deepEqual(await order(page), []);
    await noClipping(page, 'all cards hidden');
    assert(
      (await page.getByTestId('personal-home-view').innerText()).includes(
        'הבית מחכה לבחירה שלכם',
      ),
    );
    await page.getByTestId('home-reset').tap();
    assert.deepEqual(await order(page), defaultIds);
    checks.push(
      'All-hidden empty state and Reset design restore the default card selection',
    );

    assert.deepEqual(errors, [], 'No browser runtime errors');
    writeFileSync(
      `${output}/verification.json`,
      JSON.stringify(
        {passed: true, checks, physicalDeviceFrameRateMeasured: false},
        null,
        2,
      ),
    );
    console.log(checks.join('\n'));
  } catch (error) {
    await page.screenshot({path: `${output}/failure.png`});
    writeFileSync(
      `${output}/failure.json`,
      JSON.stringify(
        {
          message: error.message,
          url: page.url(),
          errors,
          text: await page.locator('body').innerText(),
          saved: await page.evaluate(
            key => localStorage.getItem(key),
            storageKey,
          ),
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
