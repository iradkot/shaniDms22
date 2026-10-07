const config = require('../jest.config');

describe('Jest project boundary', () => {
  it.each([
    ['C:\\Users\\developer\\.codex\\worktrees\\review\\app', '\\'],
    ['C:\\Users\\developer\\projects\\app', '\\'],
    ['/home/developer/.codex/worktrees/review/app', '/'],
  ])(
    'keeps app tests separate from Node tests and mocks below %s',
    (root, separator) => {
      const ignored = (...parts) =>
        config.testPathIgnorePatterns.some(pattern =>
          new RegExp(pattern).test([root, ...parts].join(separator)),
        );
      expect(ignored('__tests__', 'services', 'recordedInsulin.test.ts')).toBe(
        false,
      );
      expect(ignored('__tests__', 'mocks', 'experimentalBuild.ts')).toBe(true);
      expect(ignored('functions', 'src', 'nightscoutUpstream.test.ts')).toBe(
        true,
      );
      expect(ignored('CgmGraph', 'src', 'chart.test.ts')).toBe(true);
    },
  );
});
