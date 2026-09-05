import React from 'react';
import {withTheme} from '../../mocks/withTheme';
import {Pressable, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {ReactTestInstance} from 'react-test-renderer';
import type {
  DayGraphDataSource,
  DayGraphPeriod,
  DayGraphSnapshot,
} from 'app/modules/dayGraph';
import {DayGraphModuleView} from 'app/product/dayGraph/DayGraphModuleView';
import StackedHomeCharts from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const nextLocalDay = (dayStartMs: number): number => {
  const next = new Date(dayStartMs);
  next.setDate(next.getDate() + 1);
  return next.getTime();
};

const source = (
  load: (period: DayGraphPeriod) => Promise<DayGraphSnapshot>,
): DayGraphDataSource => ({loadDayGraph: load});

const textValues = (
  tree: renderer.ReactTestRenderer | ReactTestInstance,
): string[] => {
  const root = 'root' in tree ? tree.root : tree;
  return root
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
};

const press = (tree: renderer.ReactTestRenderer, testID: string): void => {
  const control = tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable);
  act(() => control?.props.onPress());
};

describe('DayGraphModuleView', () => {
  it.each(['bolus', 'temp-basal', 'schedule'] as const)(
    'shows the %s insulin chart when glucose readings are unavailable and keeps the missing-glucose note',
    async insulinKind => {
      const start = new Date(2026, 7, 20).getTime();
      const snapshot: DayGraphSnapshot = {
        freshness: {kind: 'fresh', fetchedAtMs: start},
        glucoseSamples: [],
        timelineItems: [],
        insulinEvents:
          insulinKind === 'bolus'
            ? [{kind: 'bolus', timestampMs: start + HOUR, units: 1.5}]
            : insulinKind === 'temp-basal'
            ? [
                {
                  kind: 'temp-basal',
                  startMs: start,
                  endMs: start + HOUR,
                  rateUnitsPerHour: 0.75,
                },
              ]
            : [],
        basalSchedule:
          insulinKind === 'schedule'
            ? [{secondsFromMidnight: 0, rateUnitsPerHour: 0.75}]
            : [],
      };
      let tree: renderer.ReactTestRenderer;
      await act(async () => {
        tree = renderer.create(
          withTheme(
            <DayGraphModuleView
              dataSource={source(async () => snapshot)}
              locale="he"
              now={() => start + 2 * HOUR}
            />,
          ),
        );
      });
      try {
        expect(
          tree!.root.findAllByProps({testID: 'day-graph-empty'}),
        ).toHaveLength(0);
        expect(
          tree!.root.findByProps({testID: 'day-graph-no-glucose'}),
        ).toBeTruthy();
        const chart = tree!.root.findByType(StackedHomeCharts).props;
        expect(chart.bgSamples).toEqual([]);
        if (insulinKind === 'schedule') {
          expect(chart.basalProfileData).toEqual([
            {time: '00:00', timeAsSeconds: 0, value: 0.75},
          ]);
        } else {
          expect(chart.insulinData).toHaveLength(1);
        }
      } finally {
        act(() => tree!.unmount());
      }
    },
  );

  it('keeps the graph visible during refresh and after a refresh failure', async () => {
    const start = new Date(2026, 7, 20).getTime();
    const snapshot: DayGraphSnapshot = {
      freshness: {kind: 'fresh', fetchedAtMs: start},
      glucoseSamples: [
        {
          identity: {sourceId: 'ns', recordId: 'g1'},
          timestampMs: start + HOUR,
          valueMgDl: 120,
        },
      ],
      timelineItems: [],
    };
    let rejectRefresh: (reason: Error) => void = () => undefined;
    const load = jest
      .fn<Promise<DayGraphSnapshot>, [DayGraphPeriod]>()
      .mockResolvedValueOnce(snapshot)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectRefresh = reject;
          }),
      )
      .mockResolvedValue(snapshot);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            dataSource={source(load)}
            locale="he"
            now={() => start + 2 * HOUR}
          />,
        ),
      );
    });
    press(tree!, 'day-graph-refresh');
    expect(
      tree!.root.findByProps({testID: 'day-graph-glucose-chart'}),
    ).toBeTruthy();
    expect(
      tree!.root.findAllByProps({testID: 'day-graph-loading'}),
    ).toHaveLength(0);
    await act(async () => {
      rejectRefresh(new Error('offline'));
    });
    expect(
      tree!.root.findByProps({testID: 'day-graph-refresh-error'}),
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({testID: 'day-graph-glucose-chart'}),
    ).toBeTruthy();
    press(tree!, 'day-graph-refresh');
    await act(async () => {});
    expect(
      tree!.root.findAllByProps({testID: 'day-graph-refresh-error'}),
    ).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('focuses an event immediately, bounds hour windows to the day, and opens its journal detail explicitly', async () => {
    const start = new Date(2026, 7, 20).getTime();
    const event = {
      kind: 'journal-meal' as const,
      identity: {sourceId: 'journal', recordId: 'meal-1'},
      sourceLabel: 'ShaniDms',
      timestampMs: start + 8 * HOUR,
      title: 'Breakfast',
    };
    const load = jest.fn(
      async (): Promise<DayGraphSnapshot> => ({
        freshness: {kind: 'fresh', fetchedAtMs: start},
        glucoseSamples: [
          {
            identity: {sourceId: 'ns', recordId: 'g1'},
            timestampMs: start + 8 * HOUR,
            valueMgDl: 120,
          },
        ],
        timelineItems: [event],
      }),
    );
    const onOpen = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            dataSource={source(load)}
            locale="en"
            now={() => start + 12 * HOUR}
            onOpenJournalEntry={onOpen}
          />,
        ),
      );
    });
    press(tree!, 'day-graph-focus-meal-1');
    const chart = () => tree!.root.findByType(StackedHomeCharts).props;
    expect(chart().fallbackAnchorTimeMs).toBe(event.timestampMs);
    expect(chart().xDomain.map((date: Date) => date.getTime())).toEqual([
      start + 6.5 * HOUR,
      start + 9.5 * HOUR,
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    press(tree!, 'day-graph-open-meal-1');
    expect(onOpen).toHaveBeenCalledWith(event);
    press(tree!, 'day-graph-range-12');
    press(tree!, 'day-graph-window-earlier');
    expect(chart().xDomain[0].getTime()).toBe(start);
    press(tree!, 'day-graph-range-all');
    expect(chart().xDomain.map((date: Date) => date.getTime())).toEqual([
      start,
      nextLocalDay(start),
    ]);
    act(() => tree!.unmount());
  });

  it('loads a typed day focus and presents stale data, visible gaps, and chronological events', async () => {
    const dayStartMs = new Date(2026, 0, 15).getTime();
    const load = jest.fn(
      async (): Promise<DayGraphSnapshot> => ({
        freshness: {
          kind: 'stale',
          fetchedAtMs: dayStartMs + 7 * HOUR,
          reason: 'Offline copy',
        },
        glucoseSamples: [
          {
            identity: {sourceId: 'ns', recordId: 'g1'},
            timestampMs: dayStartMs + HOUR,
            valueMgDl: 100,
          },
          {
            identity: {sourceId: 'ns', recordId: 'g2'},
            timestampMs: dayStartMs + HOUR + 5 * MINUTE,
            valueMgDl: 140,
          },
          {
            identity: {sourceId: 'ns', recordId: 'g3'},
            timestampMs: dayStartMs + 6 * HOUR,
            valueMgDl: 120,
          },
        ],
        activeLoadSamples: [
          {
            timestampMs: dayStartMs + HOUR,
            iobUnits: 1.2,
            bolusIobUnits: 1,
            basalIobUnits: 0.2,
            cobGrams: 18,
          },
        ],
        insulinEvents: [
          {
            kind: 'bolus',
            timestampMs: dayStartMs + 2 * HOUR,
            units: 1.25,
          },
        ],
        basalSchedule: [{secondsFromMidnight: 0, rateUnitsPerHour: 0.75}],
        timelineItems: [
          {
            kind: 'journal-activity',
            identity: {sourceId: 'journal', recordId: 'activity-1'},
            sourceLabel: 'ShaniDms',
            timestampMs: dayStartMs + 5 * HOUR,
            title: 'Walk',
          },
          {
            kind: 'external-carb',
            identity: {sourceId: 'ns', recordId: 'carb-1'},
            sourceLabel: 'Nightscout',
            timestampMs: dayStartMs + 3 * HOUR,
            title: 'Carbohydrates',
            carbohydratesGrams: 12,
          },
        ],
      }),
    );
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            dataSource={source(load)}
            expectedSampleIntervalMs={5 * MINUTE}
            initialFocus={{kind: 'day', dayStartMs}}
            locale="en"
            now={() => dayStartMs + 8 * HOUR}
          />,
        ),
      );
    });

    expect(load).toHaveBeenCalledWith({
      dayStartMs,
      dayEndMs: nextLocalDay(dayStartMs),
    });
    expect(
      tree!.root.findByProps({testID: 'day-graph-glucose-chart'}),
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({testID: 'day-graph-rich-chart'}),
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({testID: 'day-graph-rich-chart.glucose'}),
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({testID: 'day-graph-rich-chart.basal'}),
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({testID: 'day-graph-rich-chart.iob'}),
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({testID: 'day-graph-rich-chart.cob'}),
    ).toBeTruthy();
    press(tree!, 'day-graph-chart-mode-combined');
    expect(
      tree!.root.findByProps({testID: 'day-graph-rich-chart.mixed'}),
    ).toBeTruthy();
    expect(tree!.root.findByProps({testID: 'day-graph-stale'})).toBeTruthy();
    expect(
      tree!.root.findByProps({testID: 'day-graph-data-gaps'}),
    ).toBeTruthy();
    const timelineText = textValues(
      tree!.root.findByProps({testID: 'day-graph-timeline'}),
    );
    expect(timelineText.join('|')).toContain('Carbohydrates');
    expect(timelineText.join('|').indexOf('Carbohydrates')).toBeLessThan(
      timelineText.join('|').indexOf('Walk'),
    );
    const summary = tree!.root.findByProps({
      testID: 'day-graph-accessible-summary',
    });
    expect(summary.props.accessible).toBe(true);
    expect(summary.props.accessibilityLabel).toContain('Minimum 100 mg/dL');
    expect(summary.props.accessibilityLabel).toContain('1 visible data gap');
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining(['Offline copy', 'Nightscout', 'ShaniDms']),
    );
    act(() => tree!.unmount());
  });

  it('shows Hebrew empty and error states and allows retry', async () => {
    const dayStartMs = new Date(2026, 1, 1).getTime();
    const load = jest
      .fn<Promise<DayGraphSnapshot>, [DayGraphPeriod]>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        freshness: {kind: 'fresh', fetchedAtMs: dayStartMs},
        glucoseSamples: [],
        timelineItems: [],
      });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            dataSource={source(load)}
            initialFocus={{kind: 'day', dayStartMs}}
            locale="he"
            now={() => dayStartMs}
          />,
        ),
      );
    });

    expect(tree!.root.findByProps({testID: 'day-graph-error'})).toBeTruthy();
    press(tree!, 'day-graph-retry');
    await act(async () => {
      await Promise.resolve();
    });
    expect(tree!.root.findByProps({testID: 'day-graph-empty'})).toBeTruthy();
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'גרף יומי',
        'לא נמצאו קריאות סוכר או אירועים ביום הזה.',
      ]),
    );
    act(() => tree!.unmount());
  });

  it('ignores a late response after moving to the previous local day', async () => {
    const dayStartMs = new Date(2026, 3, 10).getTime();
    const pending: Array<{
      period: DayGraphPeriod;
      resolve: (snapshot: DayGraphSnapshot) => void;
    }> = [];
    const dataSource = source(
      period =>
        new Promise(resolve => {
          pending.push({period, resolve});
        }),
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            dataSource={dataSource}
            initialFocus={{kind: 'day', dayStartMs}}
            locale="en"
            now={() => dayStartMs + HOUR}
          />,
        ),
      );
    });
    expect(pending).toHaveLength(1);

    press(tree!, 'day-graph-previous');
    expect(pending).toHaveLength(2);
    await act(async () => {
      pending[1]!.resolve({
        freshness: {kind: 'fresh', fetchedAtMs: dayStartMs},
        glucoseSamples: [
          {
            identity: {sourceId: 'ns', recordId: 'new-day'},
            timestampMs: pending[1]!.period.dayStartMs + HOUR,
            valueMgDl: 120,
          },
        ],
        timelineItems: [],
      });
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'day-graph-accessible-summary'}).props
        .accessibilityLabel,
    ).toContain('Maximum 120 mg/dL');

    await act(async () => {
      pending[0]!.resolve({
        freshness: {kind: 'fresh', fetchedAtMs: dayStartMs},
        glucoseSamples: [
          {
            identity: {sourceId: 'ns', recordId: 'late'},
            timestampMs: dayStartMs + HOUR,
            valueMgDl: 200,
          },
        ],
        timelineItems: [],
      });
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'day-graph-accessible-summary'}).props
        .accessibilityLabel,
    ).toContain('Maximum 120 mg/dL');
    act(() => tree!.unmount());
  });
});
