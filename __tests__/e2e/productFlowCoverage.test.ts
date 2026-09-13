import {readFileSync, readdirSync} from 'fs';
import {resolve} from 'path';

const root = resolve(__dirname, '..', '..');
const flowDirectory = resolve(root, 'e2e/maestro');

it('runs every Product flow explicitly before excluding that tag from the legacy suite', () => {
  const workflow = readFileSync(
    resolve(root, '.github/workflows/e2e-android-maestro.yml'),
    'utf8',
  );
  const legacyIndex = workflow.indexOf('--exclude-tags=product');
  expect(legacyIndex).toBeGreaterThan(-1);
  const productFlows = readdirSync(flowDirectory).filter(filename => {
    if (!filename.endsWith('.yaml')) {
      return false;
    }
    const header = readFileSync(resolve(flowDirectory, filename), 'utf8').split(
      /^---\s*$/m,
    )[0];
    return /^\s*- product\s*$/m.test(header ?? '');
  });
  expect(productFlows).toContain('day-graph-calendar.yaml');
  for (const filename of productFlows) {
    const commandIndex = workflow.indexOf(
      `maestro test e2e/maestro/${filename}`,
    );
    expect({
      filename,
      scheduled: commandIndex >= 0 && commandIndex < legacyIndex,
    }).toEqual({filename, scheduled: true});
  }
});
