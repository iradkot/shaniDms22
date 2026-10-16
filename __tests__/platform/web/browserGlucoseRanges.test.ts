import {createBrowserGlucoseRanges} from '../../../src/platform/web/settings/browserGlucoseRanges';
import {DEFAULT_GLUCOSE_RANGE_THRESHOLDS} from '../../../src/modules/settings/glucoseRanges';
import {belongsToAccount} from '../../../src/modules/privacy/localAccountCleanup';

const ranges = {
  veryLowMaxMgDl: 60,
  targetMinMgDl: 80,
  targetMaxMgDl: 140,
  highMaxMgDl: 220,
};
const scope = {productUserId: 'account-a', workspaceId: 'workspace-a'};
const fixture = () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
  return {values, storage};
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return {promise, resolve};
}

describe('browser personal glucose ranges', () => {
  it('restores saved ranges and isolates accounts and workspaces with deletion ownership', async () => {
    const {storage, values} = fixture();
    const open = async (owner = scope) => {
      const controller = createBrowserGlucoseRanges({storage, scope: owner, isCurrentScope: () => true});
      await controller.initialize();
      return controller;
    };
    const controller = await open();
    expect(controller.getSnapshot()).toEqual(DEFAULT_GLUCOSE_RANGE_THRESHOLDS);
    await controller.save(ranges);
    expect((await open()).getSnapshot()).toEqual(ranges);
    expect((await open({...scope, productUserId: 'account-b'})).getSnapshot()).toEqual(DEFAULT_GLUCOSE_RANGE_THRESHOLDS);
    expect((await open({...scope, workspaceId: 'workspace-b'})).getSnapshot()).toEqual(DEFAULT_GLUCOSE_RANGE_THRESHOLDS);
    const [key, value] = [...values.entries()][0]!;
    expect(belongsToAccount(key, value, scope.productUserId)).toBe(true);
    expect(belongsToAccount(key, value, 'account-b')).toBe(false);
  });

  it('rejects changes before hydration and invalid ordered thresholds', async () => {
    const {storage} = fixture();
    const controller = createBrowserGlucoseRanges({storage, scope, isCurrentScope: () => true});
    await expect(controller.save(ranges)).rejects.toThrow('not ready');
    await controller.initialize();
    await expect(controller.save({...ranges, targetMinMgDl: 160})).rejects.toThrow('invalid');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps the saved snapshot when persistence fails and allows retry', async () => {
    const {storage} = fixture();
    const controller = createBrowserGlucoseRanges({storage, scope, isCurrentScope: () => true});
    await controller.initialize();
    const changed = jest.fn();
    controller.subscribe(changed);
    storage.setItem.mockRejectedValueOnce(new Error('Disk full'));
    await expect(controller.save(ranges)).rejects.toThrow('Disk full');
    expect(controller.getSnapshot()).toEqual(DEFAULT_GLUCOSE_RANGE_THRESHOLDS);
    expect(changed).not.toHaveBeenCalled();
    await controller.save(ranges);
    expect(controller.getSnapshot()).toEqual(ranges);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('serializes rapid changes so the last saved range survives reopening', async () => {
    const {storage} = fixture();
    const entered = deferred();
    const release = deferred();
    const persist = storage.setItem.getMockImplementation()!;
    storage.setItem.mockImplementationOnce(async (key, value) => {
      entered.resolve();
      await release.promise;
      await persist(key, value);
    });
    const controller = createBrowserGlucoseRanges({storage, scope, isCurrentScope: () => true});
    await controller.initialize();
    const first = controller.save(ranges);
    await entered.promise;
    const latest = {...ranges, targetMaxMgDl: 150};
    const second = controller.save(latest);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    release.resolve();
    await Promise.all([first, second]);
    const reopened = createBrowserGlucoseRanges({storage, scope, isCurrentScope: () => true});
    await reopened.initialize();
    expect(reopened.getSnapshot()).toEqual(latest);
  });

  it('prevents delayed writes and queued changes from publishing into a changed session', async () => {
    const {storage} = fixture();
    const entered = deferred();
    const release = deferred();
    const persist = storage.setItem.getMockImplementation()!;
    storage.setItem.mockImplementationOnce(async (key, value) => {
      entered.resolve();
      await release.promise;
      await persist(key, value);
    });
    let current = true;
    const controller = createBrowserGlucoseRanges({storage, scope, isCurrentScope: () => current});
    await controller.initialize();
    const changed = jest.fn();
    controller.subscribe(changed);
    const first = controller.save(ranges);
    const second = controller.save({...ranges, targetMaxMgDl: 150});
    const completed = Promise.allSettled([first, second]);
    await entered.promise;
    current = false;
    const other = createBrowserGlucoseRanges({storage, scope: {...scope, productUserId: 'account-b'}, isCurrentScope: () => true});
    await other.initialize();
    release.resolve();
    expect((await completed).every(result => result.status === 'rejected')).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    expect(other.getSnapshot()).toEqual(DEFAULT_GLUCOSE_RANGE_THRESHOLDS);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
});
