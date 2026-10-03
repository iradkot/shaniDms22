const assert = require('node:assert/strict');
const {test} = require('node:test');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const config = require('../../metro.config');
const root = path.resolve(__dirname, '../..');
const blocked = file =>
  config.resolver.blockList.some(pattern => pattern.test(file));

test('Metro ignores generated folders that other builds can replace', () => {
  for (const folder of [
    'releases',
    'android/build',
    'android/app/build',
    'ios/build',
    'functions/lib',
    'artifacts',
    'e2e/results',
  ]) {
    assert.ok(blocked(path.join(root, folder)), folder);
    assert.ok(blocked(path.join(root, folder, 'assets', 'output.js')), folder);
  }
});

test('the exclusion is rooted and never hides source or similarly named modules', () => {
  for (const file of [
    'src/product/dayGraph/RichDayGraphChart.tsx',
    'index.js',
    'releases-notes/source.ts',
    'src/releases/view.ts',
    'src/artifacts/view.ts',
    'e2e/maestro/charts-smoke.yaml',
    'node_modules/example/lib/index.js',
    'android/app/src/main/java/App.kt',
  ]) {
    assert.equal(blocked(path.join(root, file)), false, file);
  }
});

test('Metro keeps its default exclusions', () => {
  assert.ok(blocked(path.join(root, '__tests__', 'test.ts')));
});

test('Metro persisted transformations cannot cross release channels', () => {
  const cacheVersions = ['development', 'pilot', 'production'].map(channel =>
    execFileSync(process.execPath, ['-e', 'process.stdout.write(require("./metro.config").cacheVersion)'], {
      cwd: root,
      env: {...process.env, SHANI_RELEASE_CHANNEL: channel},
      encoding: 'utf8',
    }),
  );
  assert.equal(new Set(cacheVersions).size, 3);
  assert.ok(cacheVersions[1].includes('pilot'));
});
