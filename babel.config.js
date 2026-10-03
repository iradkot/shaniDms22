const {resolveReleaseChannel} = require('./scripts/release-channel.cjs');

module.exports = function babelConfig(api) {
  const isTest = api.env('test');
  api.cache.using(() => process.env.SHANI_RELEASE_CHANNEL || 'pilot');
  return {
    presets: ['@react-native/babel-preset'],
    plugins: [
      [require.resolve('./scripts/babel-release-channel.cjs'), {
        channel: resolveReleaseChannel(),
        enabled: !isTest,
      }],
      ['module-resolver', {alias: {app: './src'}}],
      ['react-native-worklets-core/plugin'],
      'react-native-reanimated/plugin',
    ],
  };
};
