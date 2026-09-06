const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('node:path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

const defaultConfig = getDefaultConfig(__dirname);
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const generatedFolders = [
  'releases',
  'android/build',
  'android/app/build',
  'ios/build',
  'functions/lib',
  'artifacts',
  'e2e/results',
];
const generatedOutputs = generatedFolders.map(
  folder =>
    new RegExp(
      `^${escapePattern(path.resolve(__dirname, folder))}(?:[/\\\\]|$)`,
    ),
);
const inheritedBlockList = defaultConfig.resolver?.blockList;

module.exports = mergeConfig(defaultConfig, {
  resolver: {
    // Web/Gradle may replace these folders while Metro is watching. They are
    // outputs, never source inputs; watching them also rescans old releases.
    blockList: [
      ...(Array.isArray(inheritedBlockList)
        ? inheritedBlockList
        : inheritedBlockList
        ? [inheritedBlockList]
        : []),
      ...generatedOutputs,
    ],
  },
});
