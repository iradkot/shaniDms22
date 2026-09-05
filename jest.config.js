module.exports = {
  preset: 'react-native',
  testPathIgnorePatterns: [
    '<rootDir>/__tests__/mocks/',
    '<rootDir>/CgmGraph/',
    // Cloud Functions use Node's test runner and are verified separately.
    '<rootDir>/functions/',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
