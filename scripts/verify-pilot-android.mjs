// Uses only a named, dedicated emulator. Never clears an app's data or touches a personal phone.
// node scripts/verify-pilot-android.mjs --serial emulator-5580 --apk ABSOLUTE_APK [--baseline ABSOLUTE_OLDER_APK] [--output ABSOLUTE_DIRECTORY]
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = option => args[args.indexOf(option) + 1];
const serial = value('--serial');
const apk = value('--apk');
const baseline = args.includes('--baseline') ? value('--baseline') : undefined;
if (!args.includes('--serial') || !args.includes('--apk') || !/^emulator-\d+$/.test(serial || '') || !path.isAbsolute(apk || '')) {
  throw new Error('Choose a dedicated emulator serial and an absolute APK path.');
}
const output = args.includes('--output') ? value('--output') : path.join(root, 'artifacts', 'pilot-qa', 'android-smoke');
if (!path.isAbsolute(output || '')) {
  throw new Error('Choose an absolute smoke report directory.');
}
mkdirSync(output, {recursive: true});
const reportFile = path.join(output, 'report.json');
const report = {
  status: 'running',
  startedAt: new Date().toISOString(),
  serial,
  apk: path.basename(apk),
  apkSha256: createHash('sha256').update(readFileSync(apk)).digest('hex'),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  sourceWorkingTreeModified: execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim().length > 0,
  checks: [],
  limitations: ['Emulator results do not verify a physical phone, live patient data, live sign-in, CGM delivery, or overnight alerts.'],
};
const save = () => writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
const adb = (command, options = {}) => execFileSync('adb', ['-s', serial, ...command], {encoding: 'utf8', windowsHide: true, timeout: 60_000, ...options});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs = 45_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if (await predicate()) return; } catch { /* Reboot/install may temporarily disconnect. */ }
    await pause(1500);
  }
  throw new Error('Expected emulator/app state did not become ready.');
}
async function launch(name) {
  adb(['shell', 'am', 'force-stop', 'com.shanidms22']);
  adb(['shell', 'am', 'start', '-W', '-n', 'com.shanidms22/.MainActivity']);
  await waitFor(async () => {
    adb(['shell', 'uiautomator', 'dump', '/sdcard/shani-pilot-ui.xml']);
    const xml = adb(['shell', 'cat', '/sdcard/shani-pilot-ui.xml']);
    // The older fixture asks for these permissions before sign-in. Deny only
    // observed legacy dialogs; a pre-consent dialog in the new APK must fail.
    if (name === 'baseline') {
      const denyId = [
        'com.android.permissioncontroller:id/permission_deny_button',
        'com.android.permissioncontroller:id/permission_deny_and_dont_ask_again_button',
      ].find(id => xml.includes(`resource-id="${id}"`));
      const dismissId = denyId ?? (xml.includes('Enable alarm permission') ? 'android:id/button2' : undefined);
      const node = dismissId && [...xml.matchAll(/<node\b[^>]*>/g)]
        .find(match => match[0].includes(`resource-id="${dismissId}"`))?.[0];
      const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (bounds) {
        const [, left, top, right, bottom] = bounds.map(Number);
        adb(['shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2))]);
        report.baselinePermissionDialogsDenied ??= [];
        if (!report.baselinePermissionDialogsDenied.includes(dismissId)) report.baselinePermissionDialogsDenied.push(dismissId);
        save();
        return false;
      }
    }
    return /login\.googleButton|Continue with Google|Sign in with Google|כניסה עם Google|product-shell/.test(xml);
  });
  const bytes = adb(['exec-out', 'screencap', '-p'], {encoding: 'buffer'});
  writeFileSync(path.join(output, `${name}.png`), bytes);
  if (!adb(['shell', 'pidof', 'com.shanidms22']).trim()) throw new Error('The application process exited.');
}
async function check(name, action) {
  console.log(`Android pilot check: ${name}`);
  report.stage = name;
  save();
  await action();
  report.checks.push({name, status: 'passed'});
  save();
}

save();
try {
  if (adb(['shell', 'getprop', 'ro.kernel.qemu']).trim() !== '1') throw new Error('This runner refuses to alter a physical phone.');
  await waitFor(() => adb(['shell', 'getprop', 'sys.boot_completed']).trim() === '1');
  report.androidApi = adb(['shell', 'getprop', 'ro.build.version.sdk']).trim();
  if (baseline) {
    await check('baseline-install', async () => {
      const result = adb(['install', '-r', baseline]);
      if (!result.includes('Success')) throw new Error('Baseline install failed.');
      await launch('baseline');
    });
  }
  await check(baseline ? 'version-upgrade' : 'install', async () => {
    const result = adb(['install', '-r', apk]);
    if (!result.includes('Success')) throw new Error('APK install failed.');
    await launch('installed');
    const metadata = adb(['shell', 'dumpsys', 'package', 'com.shanidms22']);
    report.versionCode = metadata.match(/versionCode=(\d+)/)?.[1];
    report.versionName = metadata.match(/versionName=([^\r\n]+)/)?.[1]?.trim();
  });
  await check('notification-permission-denied', async () => {
    adb(['shell', 'pm', 'revoke', 'com.shanidms22', 'android.permission.POST_NOTIFICATIONS']);
    await launch('notifications-denied');
  });
  await check('offline-cold-launch', async () => {
    adb(['shell', 'cmd', 'connectivity', 'airplane-mode', 'enable']);
    try { await launch('offline'); } finally { adb(['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable']); }
  });
  await check('process-restart', () => launch('process-restart'));
  await check('device-reboot', async () => {
    adb(['reboot']);
    await pause(4000);
    await waitFor(() => adb(['shell', 'getprop', 'sys.boot_completed']).trim() === '1', 55_000);
    await waitFor(() => adb(['shell', 'dumpsys', 'user']).includes('RUNNING_UNLOCKED'));
    await launch('reboot');
  });
  report.status = 'passed';
  report.finishedAt = new Date().toISOString();
  delete report.stage;
  save();
  console.log(`Android pilot checks passed; report: ${reportFile}`);
} catch {
  report.status = 'failed';
  report.finishedAt = new Date().toISOString();
  report.error = 'A device check failed; inspect the named stage. No health data or credentials were logged.';
  save();
  console.error(`Android pilot check failed at ${report.stage}; report: ${reportFile}`);
  process.exitCode = 1;
}
