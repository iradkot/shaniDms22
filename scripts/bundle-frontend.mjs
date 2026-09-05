import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') {
  throw new Error('Expected platform "android" or "ios".');
}

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, '..');
const outputDirectory = path.join(
  projectRoot,
  'releases',
  'frontend',
  platform,
);
const assetsDirectory = path.join(outputDirectory, 'assets');
const bundleOutput = path.join(
  outputDirectory,
  platform === 'android' ? 'index.android.bundle' : 'main.jsbundle',
);
mkdirSync(assetsDirectory, {recursive: true});

const cli = path.join(projectRoot, 'node_modules', 'react-native', 'cli.js');
const result = spawnSync(
  process.execPath,
  [
    cli,
    'bundle',
    '--platform',
    platform,
    '--dev',
    'false',
    '--entry-file',
    'index.js',
    '--bundle-output',
    bundleOutput,
    '--assets-dest',
    assetsDirectory,
    '--sourcemap-output',
    `${bundleOutput}.map`,
  ],
  {cwd: projectRoot, env: process.env, stdio: 'inherit'},
);

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
