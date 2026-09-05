import {readFileSync} from 'fs';
import {resolve} from 'path';
import {E2E_TEST_IDS} from '../../src/constants/E2E_TEST_IDS';

const root = resolve(__dirname, '..', '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

const legacyFlows = [
  'ai-analyst-settings-smoke.yaml',
  'charts-smoke.yaml',
  'glucose-log-loadbars.yaml',
  'home-header-smoke.yaml',
  'login-and-tabs.yaml',
  'nightscout-scan.yaml',
  'oracle-events.yaml',
  'tabs-visibility.yaml',
  'trends-date-range-and-hypo-investigation.yaml',
  'trends-quick-stats-regression.yaml',
] as const;

describe('Maestro product and compatibility contracts', () => {
  it('covers the product Hub, Record/Activity, Back, and Hub controls', () => {
    const flow = read('e2e/maestro/product-hub-smoke.yaml');
    [
      E2E_TEST_IDS.product.shell,
      E2E_TEST_IDS.product.hub,
      E2E_TEST_IDS.product.categoryGrid,
      E2E_TEST_IDS.product.categoryRecord,
      E2E_TEST_IDS.product.activityTile,
      E2E_TEST_IDS.product.back,
      E2E_TEST_IDS.product.hubControl,
    ].forEach(testID => expect(flow).toContain(`id: ${testID}`));
  });

  it('enters every detailed legacy flow through the real Product Hub bridge', () => {
    const bootstrap = read('e2e/maestro/subflows/enter-legacy.yaml');
    [
      E2E_TEST_IDS.product.hub,
      E2E_TEST_IDS.product.dayGraphTile,
      E2E_TEST_IDS.product.moduleBridge,
      E2E_TEST_IDS.tabs.navigator,
      E2E_TEST_IDS.screens.home,
    ].forEach(testID => expect(bootstrap).toContain(`id: ${testID}`));

    legacyFlows.forEach(filename => {
      expect(read(`e2e/maestro/${filename}`)).toContain(
        'runFlow: subflows/enter-legacy.yaml',
      );
    });
  });

  it('runs the product smoke before the full legacy suite in CI', () => {
    const workflow = read('.github/workflows/e2e-android-maestro.yml');
    const productIndex = workflow.indexOf(
      'maestro test e2e/maestro/product-hub-smoke.yaml',
    );
    const legacyIndex = workflow.indexOf(
      'maestro test e2e/maestro --exclude-tags=product',
    );

    expect(productIndex).toBeGreaterThan(-1);
    expect(legacyIndex).toBeGreaterThan(productIndex);
  });
});
