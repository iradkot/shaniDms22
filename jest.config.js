module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-url-polyfill|react-native-reanimated)/)',
  ],
  testPathIgnorePatterns: [
    '[/\\\\]__tests__[/\\\\]mocks[/\\\\]',
    '[/\\\\]CgmGraph[/\\\\]',
    // Cloud Functions use Node's test runner and are verified separately.
    '[/\\\\]functions[/\\\\]',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
