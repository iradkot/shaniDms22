import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {DailyOverviewPeriod} from 'app/modules/dailyOverview';
import {
  PersonalHomeView,
  type PersonalHomeViewProps,
} from 'app/product/home/PersonalHomeView';
import {GlucoseMiniChart, HomeWidget} from 'app/product/home/HomeWidgets';
import {ReorderList} from 'app/product/ui/reorder';
import {
  DEFAULT_HOME_PREFERENCES,
  HOME_WIDGET_IDS,
  type HomeWidgetId,
  type StoredHomePreferences,
} from 'app/product/personalization';

const now = () => new Date(2026, 8, 8, 16).getTime();
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const visibleDefaults = DEFAULT_HOME_PREFERENCES.widgetOrder.filter(
  id => !DEFAULT_HOME_PREFERENCES.hiddenWidgets.includes(id),
);

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

describe('Personal Home editor', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  let props: PersonalHomeViewProps;

  const mount = async (overrides: Partial<PersonalHomeViewProps> = {}) => {
    props = {
      locale: 'he',
      scopeKey: 'account-one:workspace-one:phone',
      value: DEFAULT_HOME_PREFERENCES,
      hydrated: true,
      sources: {
        dailyOverview: {
          loadDailyOverview: jest.fn(async (period: DailyOverviewPeriod) => ({
            glucoseSamples: Array.from({length: 48}, (_, index) => ({
              timestampMs: period.startMs + index * 30 * 60_000,
              valueMgDl: 100 + index,
            })),
            insulinSummary: {
              quality: 'available' as const,
              basalUnits: 8,
              bolusUnits: 4,
            },
          })),
        },
      },
      thresholds,
      onSave: jest.fn(async () => undefined),
      onOpenWidget: jest.fn(),
      modules: <Text testID="all-tools-content">All tools catalogue</Text>,
      now,
      ...overrides,
    };
    await act(async () => {
      tree = renderer.create(<PersonalHomeView {...props} />);
    });
  };
  const rerender = async (overrides: Partial<PersonalHomeViewProps>) => {
    props = {...props, ...overrides};
    await act(async () => tree!.update(<PersonalHomeView {...props} />));
  };
  const button = (testID: string) => {
    const match = tree!.root
      .findAllByProps({testID})
      .find(node => node.type === Pressable);
    if (!match) {
      throw new Error(`Missing Home button: ${testID}`);
    }
    return match;
  };
  const press = async (testID: string) => {
    const control = button(testID);
    expect(control.props.disabled).not.toBe(true);
    await act(async () => {
      await control.props.onPress();
    });
  };
  const widgetIds = (): HomeWidgetId[] =>
    tree!.root.findAllByType(HomeWidget).map(node => node.props.id);
  const has = (testID: string) =>
    tree!.root.findAllByProps({testID}).length > 0;
  const graphHours = () =>
    tree!.root.findByType(GlucoseMiniChart).props.hours;

  afterEach(() => {
    act(() => tree?.unmount());
    tree = undefined;
    jest.restoreAllMocks();
  });

  it('adds every widget, supports an empty design, and cancels without saving', async () => {
    await mount();
    expect(widgetIds()).toEqual(visibleDefaults);
    await press('home-customize');
    for (const id of DEFAULT_HOME_PREFERENCES.hiddenWidgets) {
      await press(`home-toggle-${id}`);
    }
    expect(widgetIds()).toEqual(HOME_WIDGET_IDS);
    for (const id of HOME_WIDGET_IDS) {
      expect(button(`home-toggle-${id}`).props.accessibilityState.checked).toBe(true);
      await press(`home-toggle-${id}`);
    }
    expect(widgetIds()).toEqual([]);
    expect(tree!.root.findAllByType(ReorderList)).toHaveLength(0);
    for (const id of HOME_WIDGET_IDS) {
      expect(button(`home-toggle-${id}`).props.accessibilityState.checked).toBe(false);
    }
    expect(button('home-save').props.disabled).toBe(false);
    await press('home-cancel');
    expect(widgetIds()).toEqual(visibleDefaults);
    expect(has('home-editor')).toBe(false);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('updates the actual graph and rendered widget order live, then saves that design', async () => {
    await mount();
    const load = props.sources.dailyOverview!.loadDailyOverview;
    const loadsBeforeEditing = jest.mocked(load).mock.calls.length;
    expect(graphHours()).toBe(6);
    await press('home-customize');
    await press('home-window-12');
    expect(graphHours()).toBe(12);
    const order = ['chat', 'weekly-glucose', 'daily-insulin', 'glucose-graph'];
    await act(async () => {
      tree!.root.findByType(ReorderList).props.onReorder(order);
    });
    expect(widgetIds()).toEqual(order);
    expect(tree!.root.findAllByType(HomeWidget).every(node => node.props.preview)).toBe(true);
    expect(has('home-open-chat')).toBe(false);
    expect(jest.mocked(load).mock.calls).toHaveLength(loadsBeforeEditing);
    expect(props.onSave).not.toHaveBeenCalled();
    await press('home-save');
    expect(props.onSave).toHaveBeenCalledWith({
      ...DEFAULT_HOME_PREFERENCES,
      glucoseWindowHours: 12,
      widgetOrder: [...order, 'time-in-range', 'weekly-insulin'],
    });
    expect(widgetIds()).toEqual(order);
    expect(graphHours()).toBe(12);
    expect(has('home-saved')).toBe(true);
    expect(has('home-editor')).toBe(false);
    await press('home-open-chat');
    expect(props.onOpenWidget).toHaveBeenCalledWith('chat');
  });

  it('resets only the draft and cancel restores the saved arrangement', async () => {
    const custom: StoredHomePreferences = {
      ...DEFAULT_HOME_PREFERENCES,
      hiddenWidgets: ['time-in-range', 'daily-insulin', 'weekly-insulin'],
      widgetOrder: ['chat', 'weekly-glucose', 'glucose-graph', 'time-in-range', 'daily-insulin', 'weekly-insulin'],
      glucoseWindowHours: 'full-day',
    };
    await mount({value: custom});
    expect(widgetIds()).toEqual(['chat', 'weekly-glucose', 'glucose-graph']);
    await press('home-customize');
    await press('home-reset');
    expect(widgetIds()).toEqual(visibleDefaults);
    expect(graphHours()).toBe(6);
    expect(props.onSave).not.toHaveBeenCalled();
    await press('home-cancel');
    expect(widgetIds()).toEqual(['chat', 'weekly-glucose', 'glucose-graph']);
    expect(graphHours()).toBe('full-day');
    await press('home-customize');
    await press('home-reset');
    await press('home-save');
    expect(props.onSave).toHaveBeenCalledWith(DEFAULT_HOME_PREFERENCES);
  });

  it('retains a failed design for retry and disables conflicting controls during persistence', async () => {
    const first = deferred();
    const retry = deferred();
    const onSave = jest.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => retry.promise);
    await mount({onSave});
    await press('home-customize');
    await press('home-window-12');
    let pending!: Promise<void>;
    act(() => {
      pending = button('home-save').props.onPress();
    });
    for (const id of [
      'home-save', 'home-cancel', 'home-reset', 'home-window-6',
      'home-mode-modules', 'home-toggle-chat', 'home-tab-modules',
    ]) {
      expect(button(id).props.disabled).toBe(true);
    }
    expect(button('home-save').props.accessibilityState.busy).toBe(true);
    expect(tree!.root.findByType(ReorderList).props.disabled).toBe(true);
    // A duplicate native event also cannot start a second write.
    await act(async () => button('home-save').props.onPress());
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.reject(new Error('Local storage full'));
      await pending;
    });
    expect(has('home-save-error')).toBe(true);
    expect(has('home-saved')).toBe(false);
    expect(graphHours()).toBe(12);
    expect(button('home-save').props.disabled).toBe(false);
    act(() => {
      pending = button('home-save').props.onPress();
    });
    expect(has('home-save-error')).toBe(false);
    await act(async () => {
      retry.resolve();
      await pending;
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1]![0]).toEqual(onSave.mock.calls[0]![0]);
    expect(has('home-editor')).toBe(false);
    expect(has('home-saved')).toBe(true);
    expect(graphHours()).toBe(12);
  });

  it('keeps an open draft stable when preferences arrive, and cancel reveals the latest saved value', async () => {
    await mount();
    await press('home-customize');
    await press('home-window-12');
    await press('home-toggle-chat');
    const incoming = {...DEFAULT_HOME_PREFERENCES, glucoseWindowHours: 'full-day'} as const;
    await rerender({value: incoming});
    expect(graphHours()).toBe(12);
    expect(widgetIds()).not.toContain('chat');
    await press('home-cancel');
    expect(graphHours()).toBe('full-day');
    expect(widgetIds()).toContain('chat');
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('drops an old account editor during a pending save and ignores its later completion', async () => {
    const oldWrite = deferred();
    const onSave = jest.fn(() => oldWrite.promise);
    await mount({onSave});
    await press('home-customize');
    await press('home-window-12');
    let pending!: Promise<void>;
    act(() => {
      pending = button('home-save').props.onPress();
    });
    const nextSave = jest.fn(async () => undefined);
    await rerender({
      scopeKey: 'account-two:workspace-two:tablet',
      value: {...DEFAULT_HOME_PREFERENCES, glucoseWindowHours: 'full-day'},
      onSave: nextSave,
    });
    expect(has('home-editor')).toBe(false);
    expect(graphHours()).toBe('full-day');
    await act(async () => {
      oldWrite.resolve();
      await pending;
    });
    expect(has('home-saved')).toBe(false);
    expect(graphHours()).toBe('full-day');
    expect(nextSave).not.toHaveBeenCalled();
    await press('home-customize');
    expect(button('home-save').props.disabled).toBe(false);
  });

  it('supports All tools as the saved default while preserving access to personal widgets', async () => {
    await mount({value: {...DEFAULT_HOME_PREFERENCES, mode: 'modules'}});
    expect(has('all-tools-content')).toBe(true);
    expect(widgetIds()).toEqual([]);
    expect(props.sources.dailyOverview!.loadDailyOverview).not.toHaveBeenCalled();
    await press('home-tab-personal');
    expect(widgetIds()).toEqual(visibleDefaults);
    expect(props.onSave).not.toHaveBeenCalled();
    await press('home-tab-modules');
    await press('home-customize');
    expect(has('home-editor')).toBe(true);
    expect(has('home-modules-preview')).toBe(true);
    await press('home-mode-personal');
    expect(has('home-modules-preview')).toBe(false);
    await press('home-save');
    expect(has('all-tools-content')).toBe(false);
    expect(props.onSave).toHaveBeenCalledWith(DEFAULT_HOME_PREFERENCES);
    await press('home-customize');
    await press('home-mode-modules');
    await press('home-save');
    expect(has('all-tools-content')).toBe(true);
    expect(widgetIds()).toEqual([]);
  });

  it('prevents editing loading defaults and remains usable when data sources are unavailable', async () => {
    await mount({hydrated: false, sources: {}});
    expect(widgetIds()).toEqual(visibleDefaults);
    expect(button('home-customize').props.disabled).toBe(true);
    await press('home-tab-modules');
    expect(has('all-tools-content')).toBe(true);
    await rerender({hydrated: true});
    expect(button('home-customize').props.disabled).toBe(false);
    await press('home-customize');
    expect(has('home-editor')).toBe(true);
    expect(widgetIds()).toEqual(visibleDefaults);
  });

  it('discards an unsaved draft when the shell explicitly resets Home', async () => {
    await mount({resetSequence: 0});
    await press('home-customize');
    await press('home-window-12');
    await press('home-toggle-chat');
    expect(graphHours()).toBe(12);
    await rerender({resetSequence: 1});
    expect(has('home-editor')).toBe(false);
    expect(graphHours()).toBe(6);
    expect(widgetIds()).toEqual(visibleDefaults);
    expect(props.onSave).not.toHaveBeenCalled();
    await press('home-tab-modules');
    await rerender({resetSequence: 2});
    expect(has('all-tools-content')).toBe(false);
    expect(widgetIds()).toEqual(visibleDefaults);
  });

  it('registers Back to close the draft or tools tab and protects an in-flight save', async () => {
    let back: (() => boolean) | undefined;
    const onRegisterBack = jest.fn((handler: (() => boolean) | undefined) => {
      back = handler;
    });
    const write = deferred();
    await mount({onRegisterBack, onSave: jest.fn(() => write.promise)});
    expect(back?.()).toBe(false);
    await press('home-tab-modules');
    await act(async () => expect(back?.()).toBe(true));
    expect(has('all-tools-content')).toBe(false);
    await press('home-customize');
    await press('home-window-12');
    await act(async () => expect(back?.()).toBe(true));
    expect(has('home-editor')).toBe(false);
    expect(graphHours()).toBe(6);
    expect(props.onSave).not.toHaveBeenCalled();
    await press('home-customize');
    await press('home-window-12');
    let pending!: Promise<void>;
    act(() => {
      pending = button('home-save').props.onPress();
    });
    await act(async () => expect(back?.()).toBe(true));
    expect(has('home-editor')).toBe(true);
    expect(button('home-save').props.disabled).toBe(true);
    // The host can publish a durable value before the save promise settles.
    await rerender({value: {...DEFAULT_HOME_PREFERENCES, glucoseWindowHours: 12}});
    expect(has('home-editor')).toBe(true);
    await act(async () => {
      write.resolve();
      await pending;
    });
    expect(has('home-editor')).toBe(false);
    expect(graphHours()).toBe(12);
    expect(back?.()).toBe(false);
    act(() => tree!.unmount());
    tree = undefined;
    expect(back).toBeUndefined();
    expect(onRegisterBack).toHaveBeenLastCalledWith(undefined);
  });
});
