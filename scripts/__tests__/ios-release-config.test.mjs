import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
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
  const [entryWorkflow, buildWorkflow] = await Promise.all([
    read('.github/workflows/ios-beta.yml'),
    read('.github/workflows/ios-beta-deploy.yml'),
  ]);
  const workflow = `${entryWorkflow}\n${buildWorkflow}`;

  assert.match(workflow, /verify:\s*\n\s+runs-on: ubuntu-latest/);
  assert.match(workflow, /needs: verify/);
  assert.match(workflow, /bundle exec fastlane ios beta/);
  assert.doesNotMatch(workflow, /github\.event\.inputs\.lane/);
  assert.match(workflow, /uses: actions\/upload-artifact@v4/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /Verify signed IPA entitlements/);
  assert.match(workflow, /Missing required iOS deployment credential/);
  assert.match(workflow, /bundle exec pod install --deployment/);
});

test('legacy iOS credentials are passed as masked reusable workflow secrets', async () => {
  const [entryWorkflow, buildWorkflow] = await Promise.all([
    read('.github/workflows/ios-beta.yml'),
    read('.github/workflows/ios-beta-deploy.yml'),
  ]);
  const credentialNames = [
    'APPLE_PROVISIONING_PROFILE',
    'APPLE_CERTIFICATE_P12',
    'APPLE_CERTIFICATE_PASSWORD',
    'CI_KEYCHAIN_PASSWORD',
    'APP_STORE_CONNECT_KEY_ID',
    'APP_STORE_CONNECT_ISSUER_ID',
    'APP_STORE_CONNECT_PRIVATE_KEY',
    'APP_STORE_CONNECT_PRIVATE_NOT_ENCODED_TO_64',
  ];

  assert.match(entryWorkflow, /uses: \.\/\.github\/workflows\/ios-beta-deploy\.yml/);
  assert.match(buildWorkflow, /on:\s*\n\s+workflow_call:/);
  assert.doesNotMatch(
    entryWorkflow.split('  beta:\n')[1],
    /^\s+(?:env|run):/m,
  );
  const environment = buildWorkflow
    .split('    env:\n')[1]
    .split('    steps:\n')[0];
  for (const name of credentialNames) {
    const binding = entryWorkflow
      .split('    secrets:\n')[1]
      .split('\n')
      .find(line => line.trimStart().startsWith(`${name}:`));
    assert.equal(
      binding?.trim(),
      `${name}: \${{ secrets.${name} || vars.${name} }}`,
    );
    assert.match(
      buildWorkflow,
      new RegExp(`      ${name}:\\n        required: false`),
    );
    assert.ok(environment.includes(`${name}: \${{ secrets.${name} }}`));
    assert.doesNotMatch(environment, new RegExp(`vars\\.${name}\\b`));
  }

  assert.ok(
    environment.includes(
      "FIRESTORE_RULES_SCHEMA_VERSION: ${{ vars.FIRESTORE_RULES_SCHEMA_VERSION || '0' }}",
    ),
  );
});

test(
  'App Store private key normalization masks exports and rejects missing keys',
  {skip: process.platform === 'win32'},
  async t => {
    const directory = await mkdtemp(join(tmpdir(), 'ios-key-normalization-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    const workflow = await read('.github/workflows/ios-beta-deploy.yml');
    const preflight = workflow.split(
      '      - name: Preflight App Store Connect token\n',
    )[1];
    const normalization = preflight
      .split('        run: |\n')[1]
      .split('          echo "Generating JWT via fastlane/spaceship..."')[0]
      .replace(/^ {10}/gm, '');
    const script =
      normalization +
      '\nbash -c \'printf "CHILD_PRIVATE_KEY=%s\\n" "$APP_STORE_CONNECT_PRIVATE_KEY"\'\n';
    const pem = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(200)}\n-----END PRIVATE KEY-----\n`;
    const encoded = Buffer.from(pem).toString('base64');
    const cases = [
      {base64: '', pem, expected: encoded},
      {
        base64: `${encoded.slice(0, 80)}\n${encoded.slice(80)}\n`,
        pem: '',
        expected: encoded,
      },
      {base64: encoded, pem: 'unused PEM input', expected: encoded},
    ];

    for (const [index, {base64, pem: plain, expected}] of cases.entries()) {
      const environmentFile = join(directory, `env-${index}`);
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_ENV: environmentFile,
          APP_STORE_CONNECT_PRIVATE_KEY: base64,
          APP_STORE_CONNECT_PRIVATE_NOT_ENCODED_TO_64: plain,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(
        result.stdout.endsWith(
          `::add-mask::${expected}\nCHILD_PRIVATE_KEY=${expected}\n`,
        ),
        'The normalized key must be masked and reach same-step subprocesses',
      );
      assert.equal(
        await readFile(environmentFile, 'utf8'),
        `APP_STORE_CONNECT_PRIVATE_KEY=${expected}\n`,
        'Later steps must receive exactly one environment-file line',
      );
    }

    const missingFile = join(directory, 'missing-env');
    const missing = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ENV: missingFile,
        APP_STORE_CONNECT_PRIVATE_KEY: '',
        APP_STORE_CONNECT_PRIVATE_NOT_ENCODED_TO_64: '',
      },
    });
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /::error::Missing App Store Connect private key/);
    assert.doesNotMatch(missing.stdout, /CHILD_PRIVATE_KEY=/);
    await assert.rejects(readFile(missingFile), {code: 'ENOENT'});
  },
);
