/* eslint-env node, browser, es2022 */
const assert = require('node:assert/strict');
const {mkdirSync, writeFileSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function run() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? {channel: process.env.PLAYWRIGHT_CHANNEL}
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: {width: 390, height: 844},
      isMobile: true,
      hasTouch: true,
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(
      `${
        process.env.APP_PERF_URL || 'http://127.0.0.1:5173'
      }/day-graph-preview.html`,
    );
    const surface = page.getByTestId('day-graph-rich-chart.cgmTouchArea');
    await surface.scrollIntoViewIfNeeded();
    const bounds = await surface.boundingBox();
    assert(bounds, 'Synthetic chart must be visible');
    const cdp = await page.context().newCDPSession(page);
    const cpuThrottle = Number(process.env.PERF_CPU_THROTTLE || 4);
    assert(
      Number.isFinite(cpuThrottle) && cpuThrottle >= 1,
      'CPU throttle must be at least 1',
    );
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: cpuThrottle});
    await page.evaluate(() => {
      window.chartRenderMetrics = {commits: 0, totalMs: 0, maxMs: 0};
      window.chartFrameMetrics = {gaps: [], longTasks: [], running: true};
      let last = performance.now();
      const tick = now => {
        window.chartFrameMetrics.gaps.push(now - last);
        last = now;
        if (window.chartFrameMetrics.running) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
      const observer = new PerformanceObserver(list => {
        window.chartFrameMetrics.longTasks.push(
          ...list.getEntries().map(entry => entry.duration),
        );
      });
      observer.observe({type: 'longtask'});
      window.chartStopMetrics = () => {
        window.chartFrameMetrics.running = false;
        observer.disconnect();
      };
    });
    const plotWidth = bounds.width - 65;
    const first = {
      x: bounds.x + 50 + plotWidth * 0.2,
      y: bounds.y + bounds.height / 2,
    };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [first],
    });
    for (let sample = 1; sample <= 120; sample++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: first.x + (plotWidth * 0.6 * sample) / 120,
            y: first.y - sample * 0.6,
          },
        ],
      });
      await page.waitForTimeout(8);
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(100);
    const metrics = await page.evaluate(() => {
      window.chartStopMetrics();
      return {
        render: window.chartRenderMetrics,
        frames: window.chartFrameMetrics,
        buildMode: document.documentElement.dataset.chartBuildMode,
      };
    });
    const text = await page
      .getByTestId('day-graph-rich-chart.tooltipDock')
      .innerText();
    assert(
      /^19:1[12]/.test(text),
      `Released cursor must follow the final finger position; saw ${
        text.split('\n')[0]
      }`,
    );
    assert.deepEqual(errors, [], 'No browser runtime errors');
    const sorted = metrics.frames.gaps.slice(1).sort((a, b) => a - b);
    const report = {
      capturedAt: new Date().toISOString(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      workingTreeModified: Boolean(
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim(),
      ),
      kind: `Synthetic ${metrics.buildMode} browser profile; not Android device FPS`,
      buildMode: metrics.buildMode,
      browser: browser.version(),
      cpuThrottle,
      inputSamples: 120,
      render: metrics.render.commits > 0 ? metrics.render : null,
      frameGapP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? null,
      longestFrameGapMs: sorted.at(-1) ?? null,
      longTaskCount: metrics.frames.longTasks.length,
      longestTaskMs: Math.max(0, ...metrics.frames.longTasks),
      finalTime: text.split('\n')[0],
    };
    mkdirSync('artifacts/performance', {recursive: true});
    writeFileSync(
      'artifacts/performance/browser.json',
      JSON.stringify(report, null, 2),
    );
    writeFileSync(
      `artifacts/performance/browser-${metrics.buildMode}.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
