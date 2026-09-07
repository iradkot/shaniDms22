/* eslint-env node, es2022 */
const {spawnSync} = require('node:child_process');
const path = require('node:path');

const domainTest = '__tests__/modules/dayGraph/calendar.test.ts';
const suites = [
  domainTest,
  '__tests__/platform/calendarGlucoseRange.test.ts',
  '__tests__/platform/nativeDayGraphDataSource.test.ts',
  '__tests__/platform/web/browserNightscoutClient.test.ts',
  '__tests__/platform/web/browserNightscoutDataSources.test.ts',
  '__tests__/apiRequests.cacheScope.test.ts',
  '__tests__/nightscoutRangeCompleteness.integration.test.ts',
  '__tests__/product/dayGraph/DayGraphCalendar.integration.test.tsx',
  '__tests__/product/dayGraph/DayGraphCalendarModal.test.tsx',
  '__tests__/product/dayGraph/useDayGraphCalendar.test.tsx',
];

// Start Node with TZ already set: changing it inside Jest is not portable.
// Exercise both a non-DST zone and genuine 23/25-hour local calendar days.
for (const [timezone, tests] of [
  ['UTC', suites],
  ['America/New_York', [domainTest]],
]) {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--runInBand',
      '--silent',
      '--runTestsByPath',
      ...tests,
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {...process.env, TZ: timezone},
      stdio: 'inherit',
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
