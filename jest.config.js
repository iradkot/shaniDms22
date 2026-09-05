module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-url-polyfill)/)',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/__tests__/mocks/',
    '<rootDir>/CgmGraph/',
    // Cloud Functions use Node's test runner and are verified separately.
    '<rootDir>/functions/',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
