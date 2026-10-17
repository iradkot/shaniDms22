import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('iOS app and test targets use the React Native minimum deployment target', async () => {
  const project = await read('ios/shaniDms22.xcodeproj/project.pbxproj');

  assert.doesNotMatch(project, /IPHONEOS_DEPLOYMENT_TARGET = 12\.4;/);
  assert.equal(
    project.match(/IPHONEOS_DEPLOYMENT_TARGET = 15\.1;/g)?.length,
    4,
  );
});

test('debug and release builds request the correct APNs environment', async () => {
  const [project, debugEntitlements, releaseEntitlements] = await Promise.all([
    read('ios/shaniDms22.xcodeproj/project.pbxproj'),
    read('ios/shaniDms22/shaniDms22Debug.entitlements'),
    read('ios/shaniDms22/shaniDms22Release.entitlements'),
  ]);

  assert.match(
    project,
    /CODE_SIGN_ENTITLEMENTS = shaniDms22\/shaniDms22Debug\.entitlements;/,
  );
  assert.match(
    project,
    /CODE_SIGN_ENTITLEMENTS = shaniDms22\/shaniDms22Release\.entitlements;/,
  );
  assert.match(debugEntitlements, /<string>development<\/string>/);
  assert.match(releaseEntitlements, /<string>production<\/string>/);
});

test('iOS CI verifies cheaply first, uses a fixed lane, and preserves build output', async () => {
  const workflow = await read('.github/workflows/ios-beta.yml');

  assert.match(workflow, /verify:\s*\n\s+runs-on: ubuntu-latest/);
  assert.match(workflow, /needs: verify/);
  assert.match(workflow, /bundle exec fastlane ios beta/);
  assert.doesNotMatch(workflow, /github\.event\.inputs\.lane/);
  assert.match(workflow, /uses: actions\/upload-artifact@v4/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /Verify signed IPA entitlements/);
  assert.match(workflow, /Missing required GitHub Secret/);
  assert.match(workflow, /bundle exec pod install --deployment/);
  assert.match(
    workflow,
    /FIRESTORE_RULES_SCHEMA_VERSION: \$\{\{ vars\.FIRESTORE_RULES_SCHEMA_VERSION \|\| '0' \}\}/,
  );
});

test('App Store preflight normalizes and exports keys before generating its token', async t => {
  const workflow = (await read('.github/workflows/ios-beta.yml')).replace(
    /\r\n/g,
    '\n',
  );
  const preflight = workflow
    .split('      - name: Preflight App Store Connect token\n')[1]
    .split('\n      - name:')[0]
    .split('        run: |\n')[1]
    .replace(/^ {10}/gm, '');
  const directory = await mkdtemp(join(tmpdir(), 'ios-preflight-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const gitBash = join(
    process.env.ProgramFiles ?? 'C:\\Program Files',
    'Git',
    'bin',
    'bash.exe',
  );
  const bash = process.platform === 'win32' && existsSync(gitBash) ? gitBash : 'bash';
  // Run the actual workflow Bash, replacing only the Ruby/API boundary. A child
  // process verifies that Ruby would receive the normalized exported value.
  const script = `
bundle() {
  bash -c '[[ "$APP_STORE_CONNECT_PRIVATE_KEY" == "$EXPECTED_PRIVATE_KEY" ]] || { echo "Token process received the wrong private key" >&2; exit 45; }; printf "test-jwt"'
}
curl() {
  [[ "$*" == *"Authorization: Bearer test-jwt"* ]] || return 46
  printf '200'
}
${preflight}`;
  const pem = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(200)}\n-----END PRIVATE KEY-----\n`;
  const encoded = Buffer.from(pem).toString('base64');
  const cases = [
    {name: 'PEM fallback', base64: '', pem},
    {
      name: 'wrapped base64',
      base64: ` \t${encoded.slice(0, 80)}\r\n${encoded.slice(80)}\n`,
      pem: '',
    },
    {name: 'base64 takes precedence', base64: encoded, pem: 'unused PEM input'},
  ];
  for (const [index, entry] of cases.entries()) {
    await t.test(entry.name, async () => {
      const environmentFile = join(directory, `env-${index}`);
      const result = spawnSync(bash, ['-c', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TMPDIR: directory.replace(/\\/g, '/'),
          GITHUB_ENV: environmentFile.replace(/\\/g, '/'),
          APP_STORE_CONNECT_PRIVATE_KEY: entry.base64,
          APP_STORE_CONNECT_PRIVATE_NOT_ENCODED_TO_64: entry.pem,
          EXPECTED_PRIVATE_KEY: encoded,
        },
      });
      assert.equal(result.status, 0, result.error?.message ?? result.stderr);
      assert.ok(
        result.stdout.includes(`::add-mask::${encoded}\nGenerating JWT`),
        'Mask the normalized value before token generation',
      );
      assert.match(result.stdout, /ASC token OK/);
      assert.equal(
        await readFile(environmentFile, 'utf8'),
        `APP_STORE_CONNECT_PRIVATE_KEY=${encoded}\n`,
        'Later steps must receive exactly one environment-file line',
      );
    });
  }
  await t.test('missing keys fail before token generation', async () => {
    const environmentFile = join(directory, 'missing-env');
    const result = spawnSync(bash, ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ENV: environmentFile.replace(/\\/g, '/'),
        APP_STORE_CONNECT_PRIVATE_KEY: '',
        APP_STORE_CONNECT_PRIVATE_NOT_ENCODED_TO_64: '',
      },
    });
    assert.equal(result.status, 1, result.error?.message ?? result.stderr);
    assert.match(result.stdout, /::error::Missing App Store Connect private key/);
    assert.doesNotMatch(result.stdout, /Generating JWT/);
    await assert.rejects(readFile(environmentFile), {code: 'ENOENT'});
  });
});
