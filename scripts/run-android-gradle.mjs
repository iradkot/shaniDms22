import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, '..');
const androidDirectory = path.join(projectRoot, 'android');
const requiresReleaseSigning = process.argv.includes(
  '--require-release-signing',
);
const gradleArguments = process.argv
  .slice(2)
  .filter(argument => argument !== '--require-release-signing');

if (gradleArguments.length === 0) {
  throw new Error('Pass at least one Gradle task.');
}

if (requiresReleaseSigning) {
  const requiredVariables = [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ];
  const missing = requiredVariables.filter(
    variable => !process.env[variable]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Production Android signing is unavailable. Missing: ${missing.join(
        ', ',
      )}. Use build:android:preview only for an internal debug-signed APK.`,
    );
  }
}

const wrapper = path.join(
  androidDirectory,
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
);
const result = spawnSync(wrapper, ['--no-daemon', ...gradleArguments], {
  cwd: androidDirectory,
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
