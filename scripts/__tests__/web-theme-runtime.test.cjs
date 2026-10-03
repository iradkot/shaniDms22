/* eslint-env node, es2022 */
const assert = require('node:assert/strict');
const path = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');
const {buildSync} = require('esbuild');

// Vite preserves object accessors. The React Native Babel transform used by
// Jest can flatten them, hiding attempts to assign to getter-only properties.
const loadBrowserTheme = () => {
  const output = buildSync({
    entryPoints: [path.resolve(__dirname, '../../src/style/theme.ts')],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    target: 'es2020',
    write: false,
    alias: {app: path.resolve(__dirname, '../../src')},
    external: ['react-native'],
  });
  const module = {exports: {}};
  vm.runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: name => {
      assert.equal(name, 'react-native');
      return {
        Dimensions: {get: () => ({width: 390, height: 844})},
        Platform: {
          OS: 'web',
          select: options => options.web ?? options.default,
        },
      };
    },
  });
  return module.exports;
};

test('browser startup and repeated theme changes preserve the theme singleton and computed getters', () => {
  const {theme, applyThemeToSingleton, getThemeById} = loadBrowserTheme();
  const singleton = theme;
  const colorFromExistingConsumer = theme.determineBgColorByGlucoseValue;
  assert.equal(
    typeof Object.getOwnPropertyDescriptor(
      theme,
      'determineBgColorByGlucoseValue',
    ).get,
    'function',
  );

  for (const id of [
    'calmBlue',
    'darkFocus',
    'highContrastRisk',
    'sunsetGlow',
    'calmBlue',
  ]) {
    assert.doesNotThrow(() => applyThemeToSingleton(id));
    assert.equal(theme, singleton);
    const expected = getThemeById(id);
    assert.equal(theme.backgroundColor, expected.backgroundColor);
    assert.equal(
      theme.determineBgColorByGlucoseValue(40),
      expected.severeBelowRange,
    );
    assert.equal(colorFromExistingConsumer(40), expected.severeBelowRange);
    assert.equal(
      typeof Object.getOwnPropertyDescriptor(
        theme,
        'determineBgColorByGlucoseValue',
      ).get,
      'function',
    );
    assert.equal(
      typeof Object.getOwnPropertyDescriptor(theme, 'getShadowStyles').get,
      'function',
    );
    assert.equal(
      typeof Object.getOwnPropertyDescriptor(theme, 'shadow').get,
      'function',
    );
    assert.deepEqual(theme.shadow.default, expected.shadow.default);
  }
});
