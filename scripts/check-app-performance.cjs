/* eslint-env node, es2022 */
const {spawnSync, execFileSync} = require('node:child_process');
const {mkdirSync, readFileSync, writeFileSync} = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts/performance');
mkdirSync(output, {recursive: true});

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw Object.assign(new Error('Performance check process failed.'), {
      exitCode: result.status ?? 1,
    });
  }
}

function checkContracts() {
  const resultsPath = path.join(output, 'contracts.json');
  const summaryPath = path.join(output, 'summary.json');
  const report = {
    capturedAt: new Date().toISOString(),
    commit: null,
    workingTreeModified: null,
    node: process.version,
    kind: 'Deterministic work budgets; not device frame-rate measurements',
    testsPassed: 0,
    success: false,
    status: 'running',
    stage: 'metadata',
    budgets: [
      'one queued native move',
      'one inspection render per frame',
      'static chart geometry reused',
      'unrelated cache payloads untouched',
      'secondary native screens load on demand',
      'AI presentation loads in its view',
      'App and AI share one live snapshot owner',
      'historical therapy analysis loads only in its mounted view',
      'event timestamps prepared once per immutable source array',
      'calendar range summaries prepare readings once',
      'visible calendar fallback reused across timeline-only updates',
    ],
  };
  // Invalidate the previous success before any child process (or git) can fail.
  // If this runner is interrupted, the report stays visibly incomplete.
  writeFileSync(summaryPath, JSON.stringify(report, null, 2));
  writeFileSync(
    resultsPath,
    JSON.stringify(
      {status: 'not-run', success: false, numPassedTests: 0},
      null,
      2,
    ),
  );
  try {
    report.commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    report.workingTreeModified = Boolean(
      execFileSync('git', ['status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
    );
    report.stage = 'preflight';
    writeFileSync(summaryPath, JSON.stringify(report, null, 2));
    run([
      '--test',
      'scripts/__tests__/chart-worklets.test.cjs',
      'scripts/__tests__/metro-output-boundary.test.cjs',
      'scripts/__tests__/performance-runner.test.cjs',
    ]);
    report.stage = 'contracts';
    writeFileSync(summaryPath, JSON.stringify(report, null, 2));
    run([
      require.resolve('jest/bin/jest'),
      '--runInBand',
      '--silent',
      '--json',
      '--outputFile',
      resultsPath,
      '__tests__/components/stackedChartsPerformance.test.tsx',
      '__tests__/components/stackedChartsMobile.test.tsx',
      '__tests__/components/stackedChartsMouse.test.tsx',
      '__tests__/components/chartTooltipPreparation.test.tsx',
      '__tests__/product/charts/interaction',
      '__tests__/nightscoutRangeCache.test.ts',
      '__tests__/App.startup.test.js',
      '__tests__/aiAnalystStartup.test.tsx',
      '__tests__/aiAnalystSharedSnapshot.integration.test.tsx',
      '__tests__/platform/nativeProductHostActivation.test.tsx',
      '__tests__/product/therapyContextActivation.test.tsx',
      '__tests__/modules/dayGraph/calendar.performance.test.ts',
      '__tests__/product/dayGraph/useDayGraphCalendar.test.tsx',
    ]);
    const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
    if (results.success !== true) {
      throw new Error('Performance contracts did not report success.');
    }
    report.testsPassed = results.numPassedTests;
    report.success = true;
    report.status = 'passed';
    report.stage = 'complete';
  } catch (error) {
    report.status = 'failed';
    report.failure = error.message;
    try {
      const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
      report.testsPassed = results.numPassedTests ?? 0;
    } catch {
      // A missing/truncated child report must not hide the original failure.
    }
    process.exitCode = error.exitCode ?? 1;
    console.error(
      `Performance checks failed during ${report.stage}: ${error.message}`,
    );
  } finally {
    writeFileSync(summaryPath, JSON.stringify(report, null, 2));
  }
  if (report.success) {
    console.log(
      `Performance contracts passed (${report.testsPassed} tests). Report: artifacts/performance/summary.json`,
    );
  }
}

if (process.argv.includes('--browser')) {
  try {
    run([path.join(__dirname, 'measure-chart-performance.cjs')]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
} else {
  checkContracts();
}
