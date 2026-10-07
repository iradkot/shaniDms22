const {
  testPathIgnorePatterns,
}: {testPathIgnorePatterns: string[]} = require('../jest.config');
const ignored = (path: string) =>
  testPathIgnorePatterns.some(pattern => new RegExp(pattern).test(path));

describe('test runner boundaries in developer worktrees', () => {
  it.each([
    ['C:\\Users\\developer\\.codex\\worktrees\\review\\app', '\\'],
    ['C:\\Users\\developer\\projects\\app', '\\'],
    ['/home/developer/.codex/worktrees/review/app', '/'],
  ])(
    'keeps app tests and excludes mocks, legacy charts and Node tests below %s',
    (root, separator) => {
      const path = (...parts: string[]) => [root, ...parts].join(separator);
      expect(
        ignored(path('__tests__', 'services', 'recordedInsulin.test.ts')),
      ).toBe(false);
      expect(ignored(path('__tests__', 'mocks', 'experimentalBuild.ts'))).toBe(
        true,
      );
      expect(
        ignored(path('functions', 'src', 'nightscoutUpstream.test.ts')),
      ).toBe(true);
      expect(ignored(path('CgmGraph', 'src', 'chart.test.ts'))).toBe(true);
    },
  );
});
