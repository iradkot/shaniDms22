const config = require('../jest.config');

describe('Jest project boundary', () => {
  it('leaves Functions node:test suites to the Functions verifier', () => {
    expect(config.testPathIgnorePatterns).toContain('<rootDir>/functions/');
  });
});
