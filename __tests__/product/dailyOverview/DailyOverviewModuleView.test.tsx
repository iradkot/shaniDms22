import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import type {
  DailyOverviewDataSource,
  DailyOverviewPeriod,
  DailyOverviewSourceSnapshot,
} from 'app/modules/dailyOverview';
import {DailyOverviewModuleView} from 'app/product/dailyOverview';
import type {DailyOverviewPreferencesRuntime} from 'app/product/dailyOverview/runtime';
import {
  DEFAULT_DAILY_OVERVIEW_PREFERENCES,
  type StoredDailyOverviewPreferences,
} from 'app/product/personalization/types';

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

const localNoon = (year: number, month: number, day: number): number =>
  new Date(year, month, day, 12).getTime();

const renderedText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return Array.isArray(value) ? value.map(renderedText).join('') : '';
};

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node => renderedText(node.props.children));

const textByTestId = (
  tree: renderer.ReactTestRenderer,
  testID: string,
): string | undefined => {
  const node = tree.root
    .findAllByProps({testID})
    .find(candidate => candidate.type === Text);
  return node ? renderedText(node.props.children) : undefined;
};

const dataSource = (
  load: (period: DailyOverviewPeriod) => Promise<DailyOverviewSourceSnapshot>,
): DailyOverviewDataSource => ({loadDailyOverview: load});

const availableSnapshot = (
  period: DailyOverviewPeriod,
  valueMgDl: number,
): DailyOverviewSourceSnapshot => ({
  glucoseSamples: [
    {timestampMs: period.startMs, valueMgDl},
    {
      timestampMs: period.startMs + (period.endMs - period.startMs) / 2,
      valueMgDl: valueMgDl + 20,
    },
  ],
  insulinSummary: {quality: 'available', basalUnits: 7, bolusUnits: 3},
});

describe('DailyOverviewModuleView', () => {
  it('honors a typed day focus and renders factual glucose and available insulin data', async () => {
    const focusedDay = new Date(2026, 0, 12).getTime();
    const load = jest.fn(async (period: DailyOverviewPeriod) =>
      availableSnapshot(period, 60),
    );
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <DailyOverviewModuleView
          dataSource={dataSource(load)}
          expectedSampleIntervalMs={12 * 60 * 60 * 1000}
          focus={{kind: 'day', dayStartMs: focusedDay}}
          locale="en"
          now={() => localNoon(2026, 0, 15)}
          thresholds={thresholds}
        />,
      );
    });

    expect(load).toHaveBeenCalledWith({
      startMs: focusedDay,
      endMs: new Date(2026, 0, 13).getTime(),
    });
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Daily overview',
        'Data coverage',
        '100%',
        'Very low',
        'Low',
        'In range',
        'High',
        'Very high',
        'Mean',
        'Minimum',
        'Maximum',
        'CV',
        'Insulin',
        'Total',
        'Basal',
        'Bolus',
      ]),
    );
    expect(textByTestId(tree!, 'daily-overview-insulin-total')).toBe('10 U');
    act(() => tree!.unmount());
  });

  it('uses Hebrew RTL copy and does not show numeric insulin cards when unavailable', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DailyOverviewModuleView
          dataSource={dataSource(async period => ({
            glucoseSamples: [{timestampMs: period.startMs, valueMgDl: 120}],
            insulinSummary: {quality: 'unavailable'},
          }))}
          locale="he"
          now={() => localNoon(2026, 0, 15)}
          thresholds={thresholds}
        />,
      );
    });

    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'מבט יומי',
        'נתוני אינסולין אינם זמינים ליום זה.',
      ]),
    );
    expect(
      tree!.root.findAllByProps({testID: 'daily-overview-insulin-total'}),
    ).toHaveLength(0);
    expect(
      tree!.root.findByProps({testID: 'daily-overview-day-controls'}).props
        .style,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({flexDirection: 'row-reverse'}),
      ]),
    );
    act(() => tree!.unmount());
  });

  it('supports previous, next, and today while ignoring a stale day response', async () => {
    const pending: Array<{
      period: DailyOverviewPeriod;
      resolve: (snapshot: DailyOverviewSourceSnapshot) => void;
    }> = [];
    const source = dataSource(
      period =>
        new Promise(resolve => {
          pending.push({period, resolve});
        }),
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DailyOverviewModuleView
          dataSource={source}
          expectedSampleIntervalMs={12 * 60 * 60 * 1000}
          locale="en"
          now={() => localNoon(2026, 0, 15)}
          thresholds={thresholds}
        />,
      );
    });
    expect(pending).toHaveLength(1);

    act(() =>
      tree!.root
        .findByProps({testID: 'daily-overview-previous'})
        .props.onPress(),
    );
    expect(pending).toHaveLength(2);

    await act(async () => {
      pending[1]!.resolve(availableSnapshot(pending[1]!.period, 120));
      await Promise.resolve();
    });
    expect(textByTestId(tree!, 'daily-overview-mean')).toBe('130 mg/dL');

    await act(async () => {
      pending[0]!.resolve(availableSnapshot(pending[0]!.period, 200));
      await Promise.resolve();
    });
    expect(textByTestId(tree!, 'daily-overview-mean')).toBe('130 mg/dL');

    act(() =>
      tree!.root.findByProps({testID: 'daily-overview-next'}).props.onPress(),
    );
    expect(pending).toHaveLength(3);
    expect(pending[2]!.period.startMs).toBe(new Date(2026, 0, 15).getTime());
    expect(
      tree!.root.findByProps({testID: 'daily-overview-next'}).props
        .accessibilityState,
    ).toEqual({disabled: true});

    act(() =>
      tree!.root
        .findByProps({testID: 'daily-overview-previous'})
        .props.onPress(),
    );
    act(() =>
      tree!.root.findByProps({testID: 'daily-overview-today'}).props.onPress(),
    );
    expect(pending[pending.length - 1]!.period.startMs).toBe(
      new Date(2026, 0, 15).getTime(),
    );
    act(() => tree!.unmount());
  });

  it('shows a retry action after an error and loads again', async () => {
    const load = jest
      .fn<Promise<DailyOverviewSourceSnapshot>, [DailyOverviewPeriod]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async period => availableSnapshot(period, 100));
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <DailyOverviewModuleView
          dataSource={dataSource(load)}
          locale="en"
          now={() => localNoon(2026, 0, 15)}
          thresholds={thresholds}
        />,
      );
    });
    expect(
      tree!.root.findByProps({testID: 'daily-overview-error'}),
    ).toBeTruthy();

    await act(async () => {
      tree!.root.findByProps({testID: 'daily-overview-retry'}).props.onPress();
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(
      tree!.root.findByProps({testID: 'daily-overview-content'}),
    ).toBeTruthy();
    act(() => tree!.unmount());
  });
});

describe('Daily overview customization', () => {
  const initialPreferences: StoredDailyOverviewPreferences = {
    schemaVersion: 1,
    rangeStyle: 'ring',
    cardOrder: ['ranges', 'mean', 'glucose', 'insulin', 'coverage'],
  };
  const fixedNow = () => localNoon(2026, 0, 15);
  const mountedTrees: renderer.ReactTestRenderer[] = [];

  const press = (tree: renderer.ReactTestRenderer, testID: string): void => {
    act(() => {
      tree.root.findByProps({testID}).props.onPress();
    });
  };

  const pressAsync = async (
    tree: renderer.ReactTestRenderer,
    testID: string,
  ): Promise<void> => {
    await act(async () => {
      await tree.root.findByProps({testID}).props.onPress();
    });
  };

  const cardOrder = (tree: renderer.ReactTestRenderer): string[] =>
    Array.from(
      new Set(
        tree.root
          .findAll(node =>
            /^daily-overview-card-(ranges|mean|glucose|insulin|coverage)$/.test(
              String(node.props.testID),
            ),
          )
          .map(node =>
            String(node.props.testID).replace('daily-overview-card-', ''),
          ),
      ),
    );

  const expectSelectedStyle = (
    tree: renderer.ReactTestRenderer,
    style: StoredDailyOverviewPreferences['rangeStyle'],
  ): void => {
    expect(
      tree.root.findByProps({testID: `daily-overview-style-${style}`}).props
        .accessibilityState,
    ).toEqual(expect.objectContaining({selected: true}));
  };

  const mount = async (
    overrides: Partial<DailyOverviewPreferencesRuntime> = {},
    load: (
      period: DailyOverviewPeriod,
    ) => Promise<DailyOverviewSourceSnapshot> = jest.fn(
      async (period: DailyOverviewPeriod) => availableSnapshot(period, 120),
    ),
  ) => {
    let runtime: DailyOverviewPreferencesRuntime = {
      scopeKey: 'account-a:phone',
      layout: 'phone',
      value: initialPreferences,
      hydrated: true,
      onSave: jest.fn(async () => undefined),
      ...overrides,
    };
    const source = dataSource(load);
    const element = () => (
      <DailyOverviewModuleView
        dataSource={source}
        layoutPreferences={runtime}
        locale="en"
        now={fixedNow}
        thresholds={thresholds}
      />
    );
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element());
    });
    mountedTrees.push(tree);
    return {
      tree,
      load,
      updateRuntime: async (next: Partial<DailyOverviewPreferencesRuntime>) => {
        runtime = {...runtime, ...next};
        await act(async () => tree.update(element()));
      },
    };
  };

  afterEach(() => {
    mountedTrees.splice(0).forEach(tree => act(() => tree.unmount()));
  });

  it('previews every range style immediately without reloading or changing medical values', async () => {
    const onSave = jest.fn(async () => undefined);
    const {tree, load} = await mount({onSave});

    press(tree, 'daily-overview-customize');
    for (const style of ['bar', 'list', 'ring'] as const) {
      press(tree, `daily-overview-style-${style}`);
      expectSelectedStyle(tree, style);
      expect(
        tree.root
          .findByProps({testID: 'daily-overview-card-ranges'})
          .findAllByProps({testID: `daily-overview-range-visual-${style}`})
          .length,
      ).toBeGreaterThan(0);
      expect(textByTestId(tree, 'daily-overview-mean')).toBe('130 mg/dL');
      expect(textByTestId(tree, 'daily-overview-insulin-total')).toBe('10 U');
    }
    expect(load).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('previews a reordered page and saves only its presentation preferences', async () => {
    const onSave = jest.fn(async () => undefined);
    const {tree} = await mount({onSave});

    expect(cardOrder(tree)).toEqual(initialPreferences.cardOrder);
    press(tree, 'daily-overview-customize');
    press(tree, 'daily-overview-style-bar');
    press(tree, 'daily-overview-move-up-mean');
    const expectedOrder = ['mean', 'ranges', 'glucose', 'insulin', 'coverage'];
    expect(cardOrder(tree)).toEqual(expectedOrder);
    expect(onSave).not.toHaveBeenCalled();

    await pressAsync(tree, 'daily-overview-save');

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      schemaVersion: 1,
      rangeStyle: 'bar',
      cardOrder: expectedOrder,
    });
    expect(cardOrder(tree)).toEqual(expectedOrder);
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-save'}),
    ).toHaveLength(0);
    expect(textByTestId(tree, 'daily-overview-mean')).toBe('130 mg/dL');
  });

  it('cancels changes to both the range style and the actual card order', async () => {
    const onSave = jest.fn(async () => undefined);
    const {tree} = await mount({onSave});

    press(tree, 'daily-overview-customize');
    press(tree, 'daily-overview-style-list');
    press(tree, 'daily-overview-move-down-ranges');
    expect(cardOrder(tree)[0]).toBe('mean');
    press(tree, 'daily-overview-cancel');

    expect(cardOrder(tree)).toEqual(initialPreferences.cardOrder);
    expect(onSave).not.toHaveBeenCalled();
    press(tree, 'daily-overview-customize');
    expectSelectedStyle(tree, 'ring');
  });

  it('resets only the draft, so Cancel restores the saved custom design', async () => {
    const onSave = jest.fn(async () => undefined);
    const savedPreferences: StoredDailyOverviewPreferences = {
      schemaVersion: 1,
      rangeStyle: 'list',
      cardOrder: ['coverage', 'insulin', 'glucose', 'mean', 'ranges'],
    };
    const {tree} = await mount({onSave, value: savedPreferences});

    press(tree, 'daily-overview-customize');
    press(tree, 'daily-overview-reset');
    expect(cardOrder(tree)).toEqual(
      DEFAULT_DAILY_OVERVIEW_PREFERENCES.cardOrder,
    );
    expectSelectedStyle(tree, DEFAULT_DAILY_OVERVIEW_PREFERENCES.rangeStyle);
    expect(onSave).not.toHaveBeenCalled();

    press(tree, 'daily-overview-cancel');
    expect(cardOrder(tree)).toEqual(savedPreferences.cardOrder);
    press(tree, 'daily-overview-customize');
    expectSelectedStyle(tree, 'list');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the edited preview after a failed save and lets the user retry', async () => {
    const onSave = jest
      .fn<Promise<void>, [StoredDailyOverviewPreferences]>()
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValueOnce(undefined);
    const {tree} = await mount({onSave});

    press(tree, 'daily-overview-customize');
    press(tree, 'daily-overview-style-bar');
    press(tree, 'daily-overview-move-up-mean');
    await pressAsync(tree, 'daily-overview-save');

    expectSelectedStyle(tree, 'bar');
    expect(cardOrder(tree)[0]).toBe('mean');
    expect(tree.root.findByProps({testID: 'daily-overview-save'})).toBeTruthy();

    await pressAsync(tree, 'daily-overview-save');
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1]).toEqual(onSave.mock.calls[0]);
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-save'}),
    ).toHaveLength(0);
  });

  it('waits for saved preferences to load before allowing customization', async () => {
    const onSave = jest.fn(async () => undefined);
    const {tree, updateRuntime} = await mount({hydrated: false, onSave});
    const customize = tree.root.findAllByProps({
      testID: 'daily-overview-customize',
    });
    expect(
      customize.length === 0 ||
        customize.every(
          node =>
            node.props.disabled || node.props.accessibilityState?.disabled,
        ),
    ).toBe(true);

    await updateRuntime({
      hydrated: true,
      value: {...initialPreferences, rangeStyle: 'list'},
    });
    press(tree, 'daily-overview-customize');
    expectSelectedStyle(tree, 'list');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('restores the last confirmed design when an optimistic host update fails to save', async () => {
    let rejectSave!: (error: Error) => void;
    const onSave = jest.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    const {tree, updateRuntime} = await mount({onSave});
    press(tree, 'daily-overview-customize');
    press(tree, 'daily-overview-style-bar');
    press(tree, 'daily-overview-move-up-mean');
    press(tree, 'daily-overview-save');

    const optimisticPreferences: StoredDailyOverviewPreferences = {
      schemaVersion: 1,
      rangeStyle: 'bar',
      cardOrder: ['mean', 'ranges', 'glucose', 'insulin', 'coverage'],
    };
    await updateRuntime({value: optimisticPreferences});
    // Hosts can recreate an equivalent preference object during a rerender.
    await updateRuntime({
      value: {
        ...optimisticPreferences,
        cardOrder: [...optimisticPreferences.cardOrder],
      },
    });
    await act(async () => rejectSave(new Error('Disk write failed')));

    expectSelectedStyle(tree, 'bar');
    expect(cardOrder(tree)).toEqual(optimisticPreferences.cardOrder);
    press(tree, 'daily-overview-cancel');
    expect(cardOrder(tree)).toEqual(initialPreferences.cardOrder);
    press(tree, 'daily-overview-customize');
    expectSelectedStyle(tree, 'ring');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('preserves the selected day when switching from the phone layout to tablet', async () => {
    const load = jest.fn(async (period: DailyOverviewPeriod) =>
      availableSnapshot(period, 120),
    );
    const {tree, updateRuntime} = await mount({}, load);
    await pressAsync(tree, 'daily-overview-previous');
    const selectedDay = textByTestId(tree, 'daily-overview-selected-day');
    const expectedPeriod = {
      startMs: new Date(2026, 0, 14).getTime(),
      endMs: new Date(2026, 0, 15).getTime(),
    };
    expect(load).toHaveBeenLastCalledWith(expectedPeriod);

    await updateRuntime({
      scopeKey: 'account-a:tablet',
      layout: 'tablet',
    });

    expect(load).toHaveBeenLastCalledWith(expectedPeriod);
    expect(textByTestId(tree, 'daily-overview-selected-day')).toBe(selectedDay);
    expect(
      tree.root.findByProps({testID: 'daily-overview-next'}).props
        .accessibilityState.disabled,
    ).toBe(false);
  });

  it('discards another account or layout draft when the preference scope changes', async () => {
    const onSave = jest.fn(async () => undefined);
    const {tree, updateRuntime} = await mount({onSave});
    press(tree, 'daily-overview-customize');
    press(tree, 'daily-overview-style-bar');
    press(tree, 'daily-overview-move-up-mean');

    const nextPreferences: StoredDailyOverviewPreferences = {
      schemaVersion: 1,
      rangeStyle: 'list',
      cardOrder: ['coverage', 'ranges', 'mean', 'glucose', 'insulin'],
    };
    await updateRuntime({
      scopeKey: 'account-b:tablet',
      layout: 'tablet',
      value: nextPreferences,
    });

    expect(
      tree.root.findAllByProps({testID: 'daily-overview-save'}),
    ).toHaveLength(0);
    expect(cardOrder(tree)).toEqual(nextPreferences.cardOrder);
    press(tree, 'daily-overview-customize');
    expectSelectedStyle(tree, 'list');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('formats insulin without long floating point tails', async () => {
    const {tree} = await mount(
      {},
      jest.fn(async (period: DailyOverviewPeriod) => ({
        ...availableSnapshot(period, 120),
        insulinSummary: {
          quality: 'available' as const,
          basalUnits: 32.0618950972221,
          bolusUnits: 28.200000000000003,
        },
      })),
    );

    expect(textByTestId(tree, 'daily-overview-insulin-basal')).toBe('32.06 U');
    expect(textByTestId(tree, 'daily-overview-insulin-bolus')).toBe('28.2 U');
    expect(textByTestId(tree, 'daily-overview-insulin-total')).toBe('60.26 U');
  });

  it('ignores an old save completion after switching to another preference scope', async () => {
    let finishSave!: () => void;
    const onSave = jest.fn(
      () =>
        new Promise<void>(resolve => {
          finishSave = resolve;
        }),
    );
    const {tree, updateRuntime} = await mount({onSave});
    press(tree, 'daily-overview-customize');
    press(tree, 'daily-overview-style-bar');
    press(tree, 'daily-overview-save');
    expect(onSave).toHaveBeenCalledTimes(1);

    await updateRuntime({
      scopeKey: 'account-b:phone',
      value: {...initialPreferences, rangeStyle: 'list'},
    });
    await act(async () => finishSave());

    press(tree, 'daily-overview-customize');
    expectSelectedStyle(tree, 'list');
    expect(cardOrder(tree)).toEqual(initialPreferences.cardOrder);
  });

  it('keeps missing glucose and insulin explicit while allowing a design change', async () => {
    const onSave = jest.fn(async () => undefined);
    const {tree} = await mount(
      {onSave},
      jest.fn(async () => ({
        glucoseSamples: [],
        insulinSummary: {quality: 'unavailable' as const},
      })),
    );

    expect(textValues(tree)).toEqual(
      expect.arrayContaining([
        'No valid glucose readings are available for this day.',
        'Insulin data is unavailable for this day.',
      ]),
    );
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-insulin-total'}),
    ).toHaveLength(0);
    expect(textByTestId(tree, 'daily-overview-mean')).not.toBe('0 mg/dL');
    press(tree, 'daily-overview-customize');
    press(tree, 'daily-overview-style-list');
    await pressAsync(tree, 'daily-overview-save');

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({rangeStyle: 'list'}),
    );
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-insulin-total'}),
    ).toHaveLength(0);
  });

  it('keeps low-coverage warnings visible when the range visualization changes', async () => {
    const {tree} = await mount();

    expect(textValues(tree)).toContain('Coverage is below 70% for this day.');
    press(tree, 'daily-overview-customize');
    press(tree, 'daily-overview-style-bar');

    expect(textValues(tree)).toContain('Coverage is below 70% for this day.');
    expect(textByTestId(tree, 'daily-overview-mean')).toBe('130 mg/dL');
  });
});
