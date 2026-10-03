import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';
import {
  WEB_RELEASE_MANIFEST_FILE,
  assertPublishableWebReleaseManifest,
  verifyPublishableWebBuild,
  webReleaseManifestPlugin,
} from '../web-release-manifest.mjs';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

test('the publishing check rejects missing, development and malformed artifact declarations', async () => {
  for (const raw of [undefined, '', '{}', 'null', '[]', 'invalid',
    '{"version":2,"channel":"pilot"}', '{"version":1,"channel":"development"}',
    '{"version":1,"channel":"Production"}', '{"version":1,"channel":true}']) {
    assert.throws(() => assertPublishableWebReleaseManifest(raw), /manifest|verified pilot/);
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'shani-manifest-'));
  try {
    await assert.rejects(verifyPublishableWebBuild(temporary), /missing or unreadable/);
    for (const channel of ['pilot', 'production']) {
      const raw = JSON.stringify({version: 1, channel});
      await writeFile(path.join(temporary, WEB_RELEASE_MANIFEST_FILE), raw);
      assert.deepEqual(await verifyPublishableWebBuild(temporary), {version: 1, channel});
      assert.ok(Object.isFrozen(assertPublishableWebReleaseManifest(raw)));
    }
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
});

test('the actual Vite declaration stamps matching immutable manifest and policy channels', async () => {
  const previous = process.env.SHANI_RELEASE_CHANNEL;
  try {
    for (const channel of ['pilot', 'production', 'development']) {
      process.env.SHANI_RELEASE_CHANNEL = channel;
      const configUrl = new URL('../../vite.config.mjs', import.meta.url);
      configUrl.searchParams.set('channel-test', channel);
      const config = (await import(configUrl.href)).default;
      assert.equal(config.define.__SHANI_RELEASE_CHANNEL__, JSON.stringify(channel));
      const manifestPlugin = config.plugins.find(plugin => plugin.name === 'shani-web-release-manifest');
      assert.ok(manifestPlugin);
      // Changing the environment after loading config cannot restamp its artifact.
      process.env.SHANI_RELEASE_CHANNEL = channel === 'development' ? 'pilot' : 'development';
      const result = await build({
        configFile: false,
        logLevel: 'silent',
        define: config.define,
        plugins: [manifestPlugin, {
          name: 'release-policy-fixture',
          resolveId: id => id === 'virtual:release-policy' ? '\0virtual:release-policy' : undefined,
          load: id => id === '\0virtual:release-policy'
            ? `export {getReleaseSafetyPolicy} from ${JSON.stringify(path.join(projectRoot, 'src/modules/releaseSafety/policy.ts').replaceAll('\\', '/'))};`
            : undefined,
        }],
        build: {write: false, minify: false, rollupOptions: {input: 'virtual:release-policy', preserveEntrySignatures: 'strict', output: {format: 'cjs'}}},
      });
      const manifest = result.output.find(asset => asset.fileName === WEB_RELEASE_MANIFEST_FILE);
      assert.deepEqual(JSON.parse(manifest.source), {version: 1, channel});
      const chunk = result.output.find(asset => asset.type === 'chunk');
      assert.doesNotMatch(chunk.code, /__SHANI_RELEASE_CHANNEL__/);
      const module = {exports: {}};
      new Function('module', 'exports', '__SHANI_RELEASE_CHANNEL__', chunk.code)(module, module.exports,
        channel === 'development' ? 'pilot' : 'development');
      assert.equal(module.exports.getReleaseSafetyPolicy().channel, channel);
      assert.equal(module.exports.getReleaseSafetyPolicy().currentRecommendations, channel === 'development');
      if (channel === 'development') {
        assert.throws(() => assertPublishableWebReleaseManifest(manifest.source), /verified pilot/);
      } else {
        assert.equal(assertPublishableWebReleaseManifest(manifest.source).channel, channel);
      }
      const emitted = [];
      config.plugins.find(plugin => plugin.name === 'shani-offline-bundle').generateBundle.call(
        {emitFile: file => emitted.push(file)}, {}, {
          manifest: {type: 'asset', fileName: WEB_RELEASE_MANIFEST_FILE},
          app: {type: 'chunk', fileName: 'assets/app.js'},
        },
      );
      assert.doesNotMatch(emitted[0].source, /\.shani-release\.json/);
      assert.match(emitted[0].source, /assets\/app\.js/);
    }
  } finally {
    if (previous === undefined) delete process.env.SHANI_RELEASE_CHANNEL;
    else process.env.SHANI_RELEASE_CHANNEL = previous;
  }
});

test('the build plugin cannot generate an unknown release channel', () => {
  for (const channel of [undefined, null, '', 'public', true]) {
    assert.throws(() => webReleaseManifestPlugin(channel), /valid immutable/);
  }
});

test('the actual deployment script rejects unsafe artifacts before credentials, network or writes', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'shani-deployment-'));
  try {
    const scriptDirectory = path.join(temporary, 'scripts');
    const output = path.join(temporary, 'releases', 'web');
    await mkdir(scriptDirectory, {recursive: true});
    await mkdir(output, {recursive: true});
    for (const filename of ['deploy-web.mjs', 'web-release-manifest.mjs']) {
      await writeFile(path.join(scriptDirectory, filename), await readFile(path.join(projectRoot, 'scripts', filename)));
    }
    await writeFile(path.join(temporary, 'firebase.json'), JSON.stringify({hosting: {site: 'shanidms-3a065', public: 'releases/web'}}));
    await writeFile(path.join(output, 'index.html'), '<html>Fixture</html>');
    const guardPath = path.join(scriptDirectory, 'no-external-actions.mjs');
    await writeFile(guardPath, `import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
childProcess.execFileSync = () => {console.error('UNSAFE_AUTH_ACTION'); process.exit(97);};
globalThis.fetch = () => {console.error('UNSAFE_NETWORK_ACTION'); process.exit(98);};
syncBuiltinESMExports();
`);
    for (const channel of [undefined, 'development', 'invalid']) {
      if (channel === undefined) {
        await rm(path.join(output, WEB_RELEASE_MANIFEST_FILE), {force: true});
      } else {
        await writeFile(path.join(output, WEB_RELEASE_MANIFEST_FILE), JSON.stringify({version: 1, channel}));
      }
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(guardPath).href, path.join(scriptDirectory, 'deploy-web.mjs')], {
        encoding: 'utf8', env: {...process.env, SHANI_RELEASE_CHANNEL: 'production'}, windowsHide: true,
      });
      assert.equal(result.status, 1);
      assert.doesNotMatch(result.stderr, /UNSAFE_AUTH_ACTION|UNSAFE_NETWORK_ACTION/);
      assert.match(result.stderr, /manifest|verified pilot/);
      assert.equal(await readFile(path.join(output, 'index.html'), 'utf8'), '<html>Fixture</html>');
      assert.deepEqual((await readdir(output)).sort(), channel === undefined
        ? ['index.html'] : [WEB_RELEASE_MANIFEST_FILE, 'index.html'].sort());
    }
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
});
