const assert = require('node:assert/strict');
const {test} = require('node:test');
const path = require('node:path');
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
    'node_modules/example/lib/index.js',
    'android/app/src/main/java/App.kt',
  ]) {
    assert.equal(blocked(path.join(root, file)), false, file);
  }
});

test('Metro keeps its default exclusions', () => {
  assert.ok(blocked(path.join(root, '__tests__', 'test.ts')));
});
