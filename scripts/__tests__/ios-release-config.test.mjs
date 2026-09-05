import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
});
