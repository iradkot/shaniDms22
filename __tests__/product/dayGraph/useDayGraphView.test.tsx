import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useDayGraphView} from 'app/product/dayGraph/useDayGraphView';
import type {DayGraphChartPreferencesRuntime} from 'app/product/dayGraph/runtime';
import {
  DEFAULT_DAY_GRAPH_PREFERENCES,
  KeyValueProductPersonalizationStore,
  selectLayoutProfile,
  updateDayGraphPreferences,
  type StoredDayGraphPreferences,
} from 'app/product/personalization';

const DAY_START = 0;
const HOUR = 3_600_000;
let view: ReturnType<typeof useDayGraphView>;
const Probe = ({
  preferences,
  focused,
}: {
  preferences?: DayGraphChartPreferencesRuntime;
  focused?: number | undefined;
}) => {
  view = useDayGraphView(DAY_START, focused, preferences);
  return null;
};
const preferences = (
  value: StoredDayGraphPreferences = DEFAULT_DAY_GRAPH_PREFERENCES,
  onSave?: (value: StoredDayGraphPreferences) => Promise<void>,
): DayGraphChartPreferencesRuntime => ({
  scopeKey: 'person-a:phone',
  layout: 'phone',
  value,
  ...(onSave === undefined ? {} : {onSave}),
});
let tree: renderer.ReactTestRenderer | undefined;
afterEach(() => {
  if (tree) {act(() => tree?.unmount());}
  tree = undefined;
});

describe('Day Graph automatic mode preferences', () => {
  it('persists a mode selection through the existing account store and reopens it without pressing Remember', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const scope = {
      productUserId: 'person-a',
      workspaceId: 'workspace-a',
      layout: 'phone',
    } as const;
    const store = new KeyValueProductPersonalizationStore(storage);
    let current = await store.read(scope);
    const onSave = jest.fn(async (value: StoredDayGraphPreferences) => {
      current = updateDayGraphPreferences(current, 'phone', value);
      await store.write(scope, current);
    });
    await act(async () => {
      tree = renderer.create(
        <Probe
          preferences={preferences(DEFAULT_DAY_GRAPH_PREFERENCES, onSave)}
        />,
      );
    });
    await act(async () => view.setMode('mixed'));
    expect(onSave).toHaveBeenCalledWith({
      ...DEFAULT_DAY_GRAPH_PREFERENCES,
      mode: 'mixed',
    });
    act(() => tree?.unmount());
    tree = undefined;
    const reopened = await new KeyValueProductPersonalizationStore(
      storage,
    ).read(scope);
    const reopenedValue = selectLayoutProfile(reopened, 'phone').dayGraph;
    await act(async () => {
      tree = renderer.create(
        <Probe preferences={preferences(reopenedValue, onSave)} />,
      );
    });
    expect(view.mode).toBe('mixed');
    const other = await store.read({...scope, productUserId: 'person-b'});
    expect(selectLayoutProfile(other, 'phone').dayGraph).toBeUndefined();
  });

  it('applies late saved defaults for the same scope without writing them back', async () => {
    const onSave = jest.fn(async () => undefined);
    act(() => {
      tree = renderer.create(<Probe preferences={preferences()} />);
    });
    await act(async () =>
      tree?.update(
        <Probe
          preferences={preferences(
            {schemaVersion: 1, mode: 'mixed', windowHours: 12},
            onSave,
          )}
        />,
      ),
    );
    expect(view.mode).toBe('mixed');
    expect(view.windowHours).toBe(12);
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([undefined, 8 * HOUR])(
    'saves mode using the default zoom while exploring or focusing %s',
    async focused => {
      const onSave = jest.fn(async () => undefined);
      const saved = {
        schemaVersion: 1,
        mode: 'separate',
        windowHours: 12,
      } as const;
      act(() => {
        tree = renderer.create(
          <Probe focused={focused} preferences={preferences(saved, onSave)} />,
        );
      });
      if (focused === undefined) {act(() => view.setWindowHours(6));}
      await act(async () => view.setMode('mixed'));
      expect(onSave).toHaveBeenCalledWith({
        schemaVersion: 1,
        mode: 'mixed',
        windowHours: 12,
      });
      expect(view.windowHours).toBe(focused === undefined ? 6 : 3);
      expect(view.windowAnchor).toBe(focused);
      expect(view.isRemembered).toBe(false);
    },
  );

  it('keeps a choice made before hydration and waits for the loaded default zoom before writing', async () => {
    const onSave = jest.fn(async () => undefined);
    act(() => {
      tree = renderer.create(
        <Probe
          preferences={{...preferences(undefined, onSave), hydrated: false}}
        />,
      );
    });
    act(() => {
      view.setMode('mixed');
      view.setWindowHours(6);
    });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () =>
      tree?.update(
        <Probe
          preferences={{
            ...preferences(
              {schemaVersion: 1, mode: 'separate', windowHours: 12},
              onSave,
            ),
            hydrated: true,
          }}
        />,
      ),
    );
    expect(view.mode).toBe('mixed');
    expect(view.windowHours).toBe(6);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      schemaVersion: 1,
      mode: 'mixed',
      windowHours: 12,
    });
  });

  it('carries a choice into the first account binding but never into another account after it', async () => {
    const onSave = jest.fn(async () => undefined);
    act(() => {
      tree = renderer.create(<Probe />);
    });
    act(() => {
      view.setMode('mixed');
      view.setWindowHours(6);
    });
    await act(async () =>
      tree?.update(
        <Probe
          preferences={preferences(
            {schemaVersion: 1, mode: 'separate', windowHours: 12},
            onSave,
          )}
        />,
      ),
    );
    expect(view.mode).toBe('mixed');
    expect(view.windowHours).toBe(6);
    expect(onSave).toHaveBeenCalledWith({
      schemaVersion: 1,
      mode: 'mixed',
      windowHours: 12,
    });
    act(() => tree?.update(<Probe />));
    act(() => view.setMode('mixed'));
    const otherSave = jest.fn(async () => undefined);
    await act(async () =>
      tree?.update(
        <Probe
          preferences={{
            ...preferences(undefined, otherSave),
            scopeKey: 'person-b:phone',
          }}
        />,
      ),
    );
    expect(view.mode).toBe('separate');
    expect(view.windowHours).toBe('full-day');
    expect(otherSave).not.toHaveBeenCalled();
  });

  it('submits rapid toggles in order and ignores late responses or old hydrated values', async () => {
    const complete: Array<() => void> = [];
    const onSave = jest.fn<Promise<void>, [StoredDayGraphPreferences]>(
      () =>
        new Promise<void>(resolve => {
          complete.push(resolve);
        }),
    );
    act(() => {
      tree = renderer.create(
        <Probe preferences={preferences(undefined, onSave)} />,
      );
    });
    act(() => {
      view.setMode('mixed');
      view.setMode('separate');
      view.setMode('mixed');
    });
    expect(onSave.mock.calls.map(([value]) => value.mode)).toEqual([
      'mixed',
      'separate',
      'mixed',
    ]);
    expect(view.saveStatus).toBe('saving');
    await act(async () => complete[2]?.());
    expect(view.saveStatus).toBe('idle');
    expect(view.isRemembered).toBe(true);
    await act(async () => {
      complete[0]?.();
      complete[1]?.();
    });
    await act(async () =>
      tree?.update(
        <Probe
          preferences={preferences(
            {schemaVersion: 1, mode: 'separate', windowHours: 'full-day'},
            onSave,
          )}
        />,
      ),
    );
    expect(view.mode).toBe('mixed');
    expect(view.saveStatus).toBe('idle');
    expect(view.isRemembered).toBe(true);
  });

  it.each(['person-b:phone', 'person-a:tablet'])(
    'ignores an old save after changing scope to %s',
    async scopeKey => {
      let complete = () => {};
      const onSave = jest.fn(
        () =>
          new Promise<void>(resolve => {
            complete = resolve;
          }),
      );
      act(() => {
        tree = renderer.create(
          <Probe preferences={preferences(undefined, onSave)} />,
        );
      });
      act(() => view.setMode('mixed'));
      const otherSave = jest.fn(async () => undefined);
      act(() =>
        tree?.update(
          <Probe
            preferences={{
              ...preferences(
                {schemaVersion: 1, mode: 'separate', windowHours: 12},
                otherSave,
              ),
              scopeKey,
            }}
          />,
        ),
      );
      await act(async () => complete());
      expect(view.mode).toBe('separate');
      expect(view.windowHours).toBe(12);
      expect(view.saveStatus).toBe('idle');
      expect(view.isRemembered).toBe(true);
      expect(otherSave).not.toHaveBeenCalled();
    },
  );

  it('deduplicates identical pending saves while allowing a newer explicit zoom default', async () => {
    const complete: Array<() => void> = [];
    const onSave = jest.fn(
      () =>
        new Promise<void>(resolve => {
          complete.push(resolve);
        }),
    );
    act(() => {
      tree = renderer.create(
        <Probe preferences={preferences(undefined, onSave)} />,
      );
    });
    act(() => {
      view.setMode('mixed');
      view.setMode('mixed');
      view.save();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    act(() => {
      view.setWindowHours(6);
      view.save();
      view.save();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    await act(async () => complete.forEach(resolve => resolve()));
    act(() => view.setWindowHours(3));
    act(() => view.setMode('separate'));
    expect(onSave).toHaveBeenLastCalledWith({
      schemaVersion: 1,
      mode: 'separate',
      windowHours: 6,
    });
    await act(async () => complete[2]?.());
    expect(view.windowHours).toBe(3);
  });

  it('keeps a failed mode choice visible and allows the same mode to retry', async () => {
    const onSave = jest
      .fn<Promise<void>, [StoredDayGraphPreferences]>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);
    act(() => {
      tree = renderer.create(
        <Probe preferences={preferences(undefined, onSave)} />,
      );
    });
    await act(async () => view.setMode('mixed'));
    expect(view.mode).toBe('mixed');
    expect(view.saveStatus).toBe('error');
    expect(view.isRemembered).toBe(false);
    await act(async () => view.setMode('mixed'));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(view.saveStatus).toBe('idle');
    expect(view.isRemembered).toBe(true);
  });
});
