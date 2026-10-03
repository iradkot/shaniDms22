/** Existing experimental feature tests must opt in just like a development build. */
export const configureExperimentalBuildForTests = (): void => {
  let previous: unknown;
  beforeEach(() => {
    previous = globalThis.__SHANI_RELEASE_CHANNEL__;
    globalThis.__SHANI_RELEASE_CHANNEL__ = 'development';
  });
  afterEach(() => {
    globalThis.__SHANI_RELEASE_CHANNEL__ = previous;
  });
};
