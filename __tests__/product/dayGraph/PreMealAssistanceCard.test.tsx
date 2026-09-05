import React from 'react';
import {withTheme} from '../../mocks/withTheme';
import {Pressable, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {DayGraphDataSource} from 'app/modules/dayGraph';
import type {PreMealAssistanceDataSource} from 'app/modules/preMealAssistance';
import {DayGraphModuleView, PreMealAssistanceCard} from 'app/product/dayGraph';

const HOUR = 60 * 60 * 1000;

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root
    .findAllByType(Text)
    .map(node => {
      const flatten = (value: unknown): string =>
        typeof value === 'string' || typeof value === 'number'
          ? String(value)
          : Array.isArray(value)
          ? value.map(flatten).join('')
          : '';
      return flatten(node.props.children);
    })
    .filter(Boolean);

describe('Day Graph pre-meal assistance', () => {
  it('offers a small explicit start action before showing contextual data', async () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();
    const emptyDaySource: DayGraphDataSource = {
      loadDayGraph: async () => ({
        freshness: {kind: 'fresh', fetchedAtMs: nowMs},
        glucoseSamples: [],
        timelineItems: [],
      }),
    };
    const onStartIntent = jest.fn();
    const dataSource: PreMealAssistanceDataSource = {
      loadContext: async () => ({
        relevance: {kind: 'inactive'},
        sourceState: {kind: 'live'},
      }),
    };
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            dataSource={emptyDaySource}
            locale="en"
            now={() => nowMs}
            preMealAssistance={{
              settings: {enabled: true, notificationsEnabled: false},
              dataSource,
              intentActive: false,
              onStartIntent,
            }}
          />,
        ),
      );
    });

    act(() => {
      tree!.root.findByProps({testID: 'pre-meal-start-intent'}).props.onPress();
    });
    expect(onStartIntent).toHaveBeenCalledTimes(1);
    expect(
      tree!.root.findAllByProps({testID: 'pre-meal-assistance-card'}),
    ).toHaveLength(0);
    act(() => tree!.unmount());
  });
  it('shows factual current context and host-provided Meals and AI actions', async () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();
    const dayStartMs = new Date(2026, 7, 30).getTime();
    const dataSource: DayGraphDataSource = {
      loadDayGraph: async () => ({
        freshness: {kind: 'fresh', fetchedAtMs: nowMs},
        glucoseSamples: [
          {
            identity: {sourceId: 'ns', recordId: 'g-1'},
            timestampMs: nowMs - 5 * 60 * 1000,
            valueMgDl: 117,
          },
        ],
        timelineItems: [],
      }),
    };
    const preMealSource: PreMealAssistanceDataSource = {
      loadContext: async () => ({
        relevance: {
          kind: 'active',
          startedAtMs: nowMs - HOUR,
          expiresAtMs: nowMs + HOUR,
        },
        sourceState: {kind: 'live'},
        facts: {
          observedAtMs: nowMs - 4 * 60 * 1000,
          glucoseMgDl: 117,
          trend: 'forty-five-up',
          iobUnits: 1.25,
          cobGrams: 12,
        },
      }),
    };
    const openMeals = jest.fn();
    const openAi = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            dataSource={dataSource}
            initialFocus={{kind: 'day', dayStartMs}}
            locale="en"
            now={() => nowMs}
            preMealAssistance={{
              settings: {enabled: true, notificationsEnabled: false},
              dataSource: preMealSource,
              onOpenMeals: openMeals,
              onOpenAi: openAi,
            }}
          />,
        ),
      );
      await Promise.resolve();
    });

    const card = tree!.root.findByProps({testID: 'pre-meal-assistance-card'});
    expect(textValues(tree!).join('|')).toContain('117 mg/dL');
    expect(textValues(tree!).join('|')).toContain('4 min ago');
    expect(textValues(tree!).join('|')).toContain('IOB 1.25 U');
    expect(textValues(tree!).join('|')).toContain('COB 12 g');
    act(() => {
      card.findByProps({testID: 'pre-meal-open-meals'}).props.onPress();
      card.findByProps({testID: 'pre-meal-open-ai'}).props.onPress();
    });
    expect(openMeals).toHaveBeenCalledTimes(1);
    expect(openAi).toHaveBeenCalledTimes(1);
    expect(
      tree!.root
        .findAllByType(Pressable)
        .filter(node => String(node.props.testID).startsWith('pre-meal-')),
    ).toHaveLength(2);
    act(() => tree!.unmount());
  });

  it('does not load or render the capability before explicit opt-in', async () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();
    const dayStartMs = new Date(2026, 7, 30).getTime();
    const loadContext = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            dataSource={{
              loadDayGraph: async () => ({
                freshness: {kind: 'fresh', fetchedAtMs: nowMs},
                glucoseSamples: [],
                timelineItems: [],
              }),
            }}
            initialFocus={{kind: 'day', dayStartMs}}
            locale="en"
            now={() => nowMs}
            preMealAssistance={{
              settings: {enabled: false, notificationsEnabled: true},
              dataSource: {loadContext},
            }}
          />,
        ),
      );
      await Promise.resolve();
    });

    expect(loadContext).not.toHaveBeenCalled();
    expect(
      tree!.root.findAllByProps({testID: 'pre-meal-assistance-card'}),
    ).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('shows a clear Hebrew offline state with RTL text', async () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();
    const period = {
      dayStartMs: new Date(2026, 7, 30).getTime(),
      dayEndMs: new Date(2026, 7, 31).getTime(),
    };
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        withTheme(
          <PreMealAssistanceCard
            locale="he"
            now={() => nowMs}
            period={period}
            runtime={{
              settings: {enabled: true, notificationsEnabled: false},
              dataSource: {
                loadContext: async () => ({
                  relevance: {
                    kind: 'active',
                    startedAtMs: nowMs - HOUR,
                    expiresAtMs: nowMs + HOUR,
                  },
                  sourceState: {kind: 'offline'},
                  facts: {
                    observedAtMs: nowMs - 2 * 60 * 1000,
                    glucoseMgDl: 103,
                  },
                }),
              },
            }}
          />,
        ),
      );
      await Promise.resolve();
    });

    expect(textValues(tree!)).toEqual(
      expect.arrayContaining(['לפני ארוחה', 'אין חיבור · נתונים שמורים']),
    );
    const title = tree!.root
      .findAllByType(Text)
      .find(node => node.props.children === 'לפני ארוחה');
    expect(title?.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({writingDirection: 'rtl'}),
      ]),
    );
    expect(tree!.root.findAllByType(Pressable)).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('ignores a late context response after its data source changes', async () => {
    const nowMs = new Date(2026, 7, 30, 12).getTime();
    const period = {
      dayStartMs: new Date(2026, 7, 30).getTime(),
      dayEndMs: new Date(2026, 7, 31).getTime(),
    };
    let resolveFirst:
      | ((
          value: Awaited<
            ReturnType<PreMealAssistanceDataSource['loadContext']>
          >,
        ) => void)
      | undefined;
    const firstSource: PreMealAssistanceDataSource = {
      loadContext: () =>
        new Promise(resolve => {
          resolveFirst = resolve;
        }),
    };
    const currentSnapshot = {
      relevance: {
        kind: 'active' as const,
        startedAtMs: nowMs - HOUR,
        expiresAtMs: nowMs + HOUR,
      },
      sourceState: {kind: 'live' as const},
      facts: {observedAtMs: nowMs, glucoseMgDl: 120},
    };
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PreMealAssistanceCard
            locale="en"
            now={() => nowMs}
            period={period}
            runtime={{
              settings: {enabled: true, notificationsEnabled: false},
              dataSource: firstSource,
            }}
          />,
        ),
      );
    });

    await act(async () => {
      tree!.update(
        withTheme(
          <PreMealAssistanceCard
            locale="en"
            now={() => nowMs}
            period={period}
            runtime={{
              settings: {enabled: true, notificationsEnabled: false},
              dataSource: {loadContext: async () => currentSnapshot},
            }}
          />,
        ),
      );
      await Promise.resolve();
    });
    expect(textValues(tree!).join('|')).toContain('120 mg/dL');

    await act(async () => {
      resolveFirst?.({
        ...currentSnapshot,
        facts: {observedAtMs: nowMs, glucoseMgDl: 300},
      });
      await Promise.resolve();
    });
    expect(textValues(tree!).join('|')).toContain('120 mg/dL');
    expect(textValues(tree!).join('|')).not.toContain('300 mg/dL');
    act(() => tree!.unmount());
  });
});
