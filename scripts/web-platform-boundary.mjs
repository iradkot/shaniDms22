/** Fail the Web build if a native-only safe-area view slipped through resolution. */
export const assertBrowserSafeAreaBoundary = moduleIds => {
  const nativeModules = moduleIds.filter(id => {
    const normalized = id.replaceAll('\\', '/').split('?')[0];
    return (
      normalized.includes('/react-native-safe-area-context/') &&
      /\/(?:NativeSafeAreaProvider|NativeSafeAreaView|SafeAreaView)\.(?:[jt]sx?)$/.test(
        normalized,
      )
    );
  });
  if (nativeModules.length > 0) {
    throw new Error(
      `Web resolved native-only safe-area components. Check the Vite source alias and .web extensions:\n${nativeModules.join(
        '\n',
      )}`,
    );
  }
};
