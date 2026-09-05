import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertBrowserSafeAreaBoundary} from '../web-platform-boundary.mjs';

test('accepts the actual Web implementations and shared safe-area context', () => {
  assert.doesNotThrow(() =>
    assertBrowserSafeAreaBoundary([
      '/node_modules/react-native-safe-area-context/src/NativeSafeAreaProvider.web.tsx',
      '/node_modules/react-native-safe-area-context/src/SafeAreaView.web.tsx',
      '/node_modules/react-native-safe-area-context/src/SafeAreaContext.tsx',
      '/src/product/dayGraph/RichDayGraphChart.tsx',
    ]),
  );
});

test('rejects native source and compiled modules, including Windows paths and query suffixes', () => {
  for (const id of [
    '/node_modules/react-native-safe-area-context/src/NativeSafeAreaProvider.tsx',
    '/node_modules/react-native-safe-area-context/src/specs/NativeSafeAreaView.ts',
    '/node_modules/react-native-safe-area-context/lib/module/SafeAreaView.js?v=123',
    'C:\\repo\\node_modules\\react-native-safe-area-context\\lib\\module\\NativeSafeAreaProvider.js',
  ]) {
    assert.throws(
      () => assertBrowserSafeAreaBoundary([id]),
      /native-only safe-area/,
    );
  }
});
