const assert = require('node:assert/strict');
const test = require('node:test');
const {transformSync} = require('@babel/core');
const {resolveReleaseChannel, productionReleaseEnvironment} = require('../release-channel.cjs');
const plugin = require('../babel-release-channel.cjs');
const {readFileSync} = require('node:fs');
const path = require('node:path');

test('missing configuration is restricted and invalid channels fail builds', () => {
  assert.equal(resolveReleaseChannel({}), 'pilot');
  for (const channel of ['development', 'pilot', 'production']) {
    assert.equal(resolveReleaseChannel({SHANI_RELEASE_CHANNEL: channel}), channel);
  }
  assert.throws(() => resolveReleaseChannel({SHANI_RELEASE_CHANNEL: 'prod'}));
  assert.throws(() => productionReleaseEnvironment({SHANI_RELEASE_CHANNEL: 'development'}));
  assert.equal(productionReleaseEnvironment({}).SHANI_RELEASE_CHANNEL, 'production');
});

test('production bundles embed an immutable channel instead of a runtime global', () => {
  const compiled = transformSync('const enabled = typeof __SHANI_RELEASE_CHANNEL__ !== "undefined" && __SHANI_RELEASE_CHANNEL__ === "development";', {
    babelrc: false,
    configFile: false,
    plugins: [[plugin, {channel: 'pilot'}]],
  }).code;
  assert.doesNotMatch(compiled, /__SHANI_RELEASE_CHANNEL__/);
  const enabled = new Function('globalThis', `${compiled}; return enabled;`)({__SHANI_RELEASE_CHANNEL__: 'development'});
  assert.equal(enabled, false);
});

test('test transforms preserve the global so fail-closed and development behavior can be exercised', () => {
  const compiled = transformSync('const value = __SHANI_RELEASE_CHANNEL__;', {
    babelrc: false,
    configFile: false,
    plugins: [[plugin, {channel: 'pilot', enabled: false}]],
  }).code;
  assert.match(compiled, /__SHANI_RELEASE_CHANNEL__/);
});

test('the actual native policy compiles to the chosen channel and ignores a changed runtime global', () => {
  const filename = path.resolve(__dirname, '../../src/modules/releaseSafety/policy.ts');
  const source = readFileSync(filename, 'utf8');
  for (const channel of ['pilot', 'production', 'development']) {
    const previous = process.env.SHANI_RELEASE_CHANNEL;
    try {
      process.env.SHANI_RELEASE_CHANNEL = channel;
      const compiled = transformSync(source, {filename, envName: 'production'}).code;
      assert.doesNotMatch(compiled, /__SHANI_RELEASE_CHANNEL__/);
      const exports = {};
      new Function('exports', '__SHANI_RELEASE_CHANNEL__', compiled)(exports, channel === 'development' ? 'pilot' : 'development');
      assert.equal(exports.getReleaseSafetyPolicy().channel, channel);
      assert.equal(exports.isRecommendationAllowed({kind: 'now'}), channel === 'development');
      assert.equal(exports.isRecommendationAllowed({kind: 'weekly'}), true);
    } finally {
      if (previous === undefined) delete process.env.SHANI_RELEASE_CHANNEL;
      else process.env.SHANI_RELEASE_CHANNEL = previous;
    }
  }
});
