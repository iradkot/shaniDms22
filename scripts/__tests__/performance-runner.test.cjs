/* eslint-env node, es2022 */
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

const scriptDirectory = path.resolve(__dirname, '..');
const output = path.resolve(scriptDirectory, '../artifacts/performance');
const script = readFileSync(
  path.join(scriptDirectory, 'check-app-performance.cjs'),
  'utf8',
);

// Execute the real CLI, replacing only process/filesystem seams. No child Jest
// process or on-disk reports are needed to reproduce a stale-success report.
function runFixture(steps) {
  const files = new Map(
    ['summary.json', 'contracts.json'].map(name => [
      path.join(output, name),
      JSON.stringify({success: true, capturedAt: 'previous-run'}),
    ]),
  );
  const fakeProcess = {
    execPath: process.execPath,
    version: process.version,
    argv: ['node', 'check-app-performance.cjs'],
    exitCode: 0,
    exit(code) {
      this.exitCode = code;
      throw new Error('process.exit');
    },
  };
  let launches = 0;
  const fixtureRequire = name => {
    if (name === 'node:child_process') {
      return {
        execFileSync: (_command, args) =>
          args[0] === 'rev-parse' ? 'fixture-commit\n' : '',
        spawnSync: () => {
          const step = steps[launches++];
          assert(step, 'Unexpected additional child process');
          if (step.report) {
            files.set(
              path.join(output, 'contracts.json'),
              JSON.stringify(step.report),
            );
          }
          return step.result;
        },
      };
    }
    if (name === 'node:fs') {
      return {
        mkdirSync() {},
        writeFileSync: (filename, content) => files.set(filename, content),
        readFileSync: filename => {
          assert(files.has(filename), `Missing fixture report: ${filename}`);
          return files.get(filename);
        },
      };
    }
    return require(name);
  };
  fixtureRequire.resolve = require.resolve;
  try {
    vm.runInNewContext(script, {
      require: fixtureRequire,
      __dirname: scriptDirectory,
      process: fakeProcess,
      console: {log() {}, error() {}},
    });
  } catch (error) {
    // The old runner called process.exit before replacing its successful report.
    if (error.message !== 'process.exit') {
      throw error;
    }
  }
  return {
    exitCode: fakeProcess.exitCode,
    summary: JSON.parse(files.get(path.join(output, 'summary.json'))),
    contracts: JSON.parse(files.get(path.join(output, 'contracts.json'))),
    launches,
  };
}

test('a failed preflight replaces old successful reports with this failed run', () => {
  const run = runFixture([{result: {status: 2}}]);
  assert.equal(run.exitCode, 2);
  assert.equal(run.summary.success, false);
  assert.equal(run.summary.status, 'failed');
  assert.equal(run.summary.commit, 'fixture-commit');
  assert.notEqual(run.summary.capturedAt, 'previous-run');
  assert.equal(run.contracts.success, false);
  assert.equal(run.launches, 1);
});

test('Jest failure preserves the current detailed result and a failing summary', () => {
  const report = {success: false, numPassedTests: 3, numFailedTests: 1};
  const run = runFixture([
    {result: {status: 0}},
    {result: {status: 1}, report},
  ]);
  assert.equal(run.exitCode, 1);
  assert.equal(run.summary.success, false);
  assert.equal(run.summary.testsPassed, 3);
  assert.deepEqual(run.contracts, report);
});

test('a terminated child is failure, never a successful or previous report', () => {
  const run = runFixture([{result: {status: null, signal: 'SIGTERM'}}]);
  assert.equal(run.exitCode, 1);
  assert.equal(run.summary.status, 'failed');
  assert.equal(run.summary.success, false);
});

test('a spawn error leaves a current failure report and nonzero exit code', () => {
  const error = Object.assign(new Error('Executable unavailable'), {
    code: 'ENOENT',
  });
  const run = runFixture([{result: {status: null, error}}]);
  assert.equal(run.exitCode, 1);
  assert.equal(run.summary.status, 'failed');
  assert.equal(run.summary.success, false);
  assert.equal(run.summary.failure, 'Executable unavailable');
});

test('exit zero without a successful Jest report cannot claim success', () => {
  for (const report of [undefined, {success: false, numPassedTests: 2}]) {
    const run = runFixture([
      {result: {status: 0}},
      {result: {status: 0}, report},
    ]);
    assert.equal(run.exitCode, 1);
    assert.equal(run.summary.status, 'failed');
    assert.equal(run.summary.success, false);
  }
});

test('successful completion replaces pending reports with the current result', () => {
  const report = {success: true, numPassedTests: 7, numFailedTests: 0};
  const run = runFixture([
    {result: {status: 0}},
    {result: {status: 0}, report},
  ]);
  assert.equal(run.exitCode, 0);
  assert.equal(run.summary.success, true);
  assert.equal(run.summary.status, 'passed');
  assert.equal(run.summary.testsPassed, 7);
  assert.deepEqual(run.contracts, report);
});
