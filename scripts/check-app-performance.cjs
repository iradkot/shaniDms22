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
    process.exit(result.status ?? 1);
  }
}

if (process.argv.includes('--browser')) {
  run([path.join(__dirname, 'measure-chart-performance.cjs')]);
} else {
  run([
    '--test',
    'scripts/__tests__/chart-worklets.test.cjs',
    'scripts/__tests__/metro-output-boundary.test.cjs',
  ]);
  const resultsPath = path.join(output, 'contracts.json');
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
    '__tests__/product/charts/interaction',
    '__tests__/nightscoutRangeCache.test.ts',
    '__tests__/App.startup.test.js',
    '__tests__/aiAnalystStartup.test.tsx',
    '__tests__/aiAnalystSharedSnapshot.integration.test.tsx',
    '__tests__/platform/nativeProductHostActivation.test.tsx',
    '__tests__/product/therapyContextActivation.test.tsx',
  ]);
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const report = {
    capturedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    workingTreeModified: Boolean(
      execFileSync('git', ['status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
    ),
    node: process.version,
    kind: 'Deterministic work budgets; not device frame-rate measurements',
    testsPassed: results.numPassedTests,
    success: results.success,
    budgets: [
      'one queued native move',
      'one inspection render per frame',
      'static chart geometry reused',
      'unrelated cache payloads untouched',
      'secondary native screens load on demand',
      'AI presentation loads in its view',
      'App and AI share one live snapshot owner',
      'historical therapy analysis loads only in its mounted view',
    ],
  };
  writeFileSync(
    path.join(output, 'summary.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Performance contracts passed (${report.testsPassed} tests). Report: artifacts/performance/summary.json`,
  );
}
