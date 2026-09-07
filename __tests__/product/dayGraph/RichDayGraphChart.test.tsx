import React from 'react';
import {withTheme} from '../../mocks/withTheme';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import Svg, {Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import {applyThemeToSingleton, getThemeById} from 'app/style/theme';
import type {ThemeType} from 'app/types/theme';
import {buildDayGraph} from 'app/modules/dayGraph';
import {RichDayGraphChart} from 'app/product/dayGraph/RichDayGraphChart';
import type {DayGraphChartPreferencesRuntime} from 'app/product/dayGraph/runtime';
import {DEFAULT_DAY_GRAPH_PREFERENCES} from 'app/product/personalization/types';
import StackedHomeCharts from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';

const HOUR = 3600000;
const modelFor = (start = 0, duration = 24 * HOUR) =>
  buildDayGraph({
    period: {dayStartMs: start, dayEndMs: start + duration},
    expectedSampleIntervalMs: 5 * 60000,
    glucoseSamples: [
      {
        identity: {sourceId: 'fixture', recordId: 'g1'},
        timestampMs: start + 8 * HOUR,
        valueMgDl: 120,
      },
    ],
    timelineItems: [],
  });
const model = modelFor();
const preferences = (
  onSave: NonNullable<DayGraphChartPreferencesRuntime['onSave']> = jest.fn(
    async () => undefined,
  ),
): DayGraphChartPreferencesRuntime => ({
  scopeKey: 'user-1:phone',
  layout: 'phone',
  value: DEFAULT_DAY_GRAPH_PREFERENCES,
  onSave,
});
const control = (tree: renderer.ReactTestRenderer, testID: string) => {
  const found = tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable);
  if (!found) {
    throw new Error(`Missing control: ${testID}`);
  }
  return found;
};
const press = (tree: renderer.ReactTestRenderer, id: string) => {
  act(() => {
    control(tree, id).props.onPress();
  });
};
const chart = (tree: renderer.ReactTestRenderer) =>
  tree.root.findByType(StackedHomeCharts).props;
const domain = (tree: renderer.ReactTestRenderer) =>
  chart(tree).xDomain.map((date: Date) => date.getTime());

describe('Rich Day Graph presentation', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => {
    applyThemeToSingleton('calmBlue');
    if (tree) {
      act(() => tree.unmount());
    }
  });

  it('keeps the phone overview compact while selected point details expand independently', () => {
    act(() => {
      tree = renderer.create(
        withTheme(
          <RichDayGraphChart locale="he" model={model} availableHeight={580} />,
        ),
      );
    });
    const before = domain(tree);
    const height = chart(tree).cgmHeight;
    const insulinValues = () =>
      tree.root.findAllByProps({testID: 'chart-inspector-value-iob'});
    expect(
      control(tree, 'chart-inspector-toggle-details').props.accessibilityState
        .expanded,
    ).toBe(false);
    expect(insulinValues()).toHaveLength(0);
    press(tree, 'chart-inspector-toggle-details');
    expect(insulinValues().length).toBeGreaterThan(0);
    expect(chart(tree).cgmHeight).toBe(height);
    expect(domain(tree)).toEqual(before);
    press(tree, 'chart-inspector-toggle-details');
    expect(insulinValues()).toHaveLength(0);
    expect(domain(tree)).toEqual(before);
  });

  it('switches populated insulin and carbs between separate plots and one overlaid plot', () => {
    const populatedModel = buildDayGraph({
      period: {dayStartMs: 0, dayEndMs: 24 * HOUR},
      expectedSampleIntervalMs: 5 * 60000,
      glucoseSamples: [0, 1].map(index => ({
        identity: {sourceId: 'fixture', recordId: `glucose-${index}`},
        timestampMs: 8 * HOUR + index * 5 * 60000,
        valueMgDl: 120,
      })),
      activeLoadSamples: [0, 1].map(index => ({
        timestampMs: 8 * HOUR + index * 5 * 60000,
        iobUnits: 1.5 - index * 0.1,
        cobGrams: 30 - index,
      })),
      insulinEvents: [{kind: 'bolus', timestampMs: 8 * HOUR, units: 1.25}],
      basalSchedule: [{secondsFromMidnight: 0, rateUnitsPerHour: 0.75}],
      timelineItems: [],
    });
    act(() => {
      tree = renderer.create(
        withTheme(<RichDayGraphChart locale="en" model={populatedModel} />),
      );
    });
    for (const testID of [
      'basal-scheduled-segment',
      'iob-line-segment',
      'cob-line-segment',
      'bolus-dose-bar',
    ]) {
      expect(tree.root.findAllByProps({testID}).length).toBeGreaterThan(0);
    }
    press(tree, 'day-graph-range-3');
    const before = domain(tree);
    press(tree, 'day-graph-chart-mode-combined');
    const overlay = tree.root
      .findAllByProps({testID: 'day-graph-rich-chart.mixed'})
      .find(node => node.type === View)!;
    expect(overlay.findAllByType(Svg)).toHaveLength(1);
    expect(domain(tree)).toEqual(before);
    press(tree, 'day-graph-chart-mode-detailed');
    expect(
      tree.root.findAllByProps({testID: 'day-graph-rich-chart.mixed'}),
    ).toHaveLength(0);
    expect(domain(tree)).toEqual(before);
  });

  it('renders independent loads and their inspector values without inventing glucose', () => {
    const loadsOnly = buildDayGraph({
      period: {dayStartMs: 0, dayEndMs: 24 * HOUR},
      expectedSampleIntervalMs: 5 * 60000,
      glucoseSamples: [],
      activeLoadSamples: [0, 1].map(index => ({
        timestampMs: 8 * HOUR + index * 5 * 60000,
        iobUnits: 1.5 - index * 0.1,
        cobGrams: 30 - index,
      })),
      timelineItems: [],
    });
    act(() => {
      tree = renderer.create(
        withTheme(<RichDayGraphChart locale="en" model={loadsOnly} />),
      );
    });
    expect(chart(tree).bgSamples).toHaveLength(0);
    expect(
      tree.root.findAllByProps({testID: 'iob-line-segment'}).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({testID: 'cob-line-segment'}).length,
    ).toBeGreaterThan(0);
    expect(tree.root.findByType(HomeChartsTooltip).props).toMatchObject({
      bgSample: null,
      activeInsulinU: 1.4,
      cobG: 29,
    });
    press(tree, 'day-graph-chart-mode-combined');
    expect(
      tree.root.findAllByProps({testID: 'iob-line-segment'}).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({testID: 'cob-line-segment'}).length,
    ).toBeGreaterThan(0);
  });

  it('distinguishes failed and stale insulin sources from an empty successful response', () => {
    const partial = {
      ...model,
      dataAvailability: {
        treatments: 'unavailable',
        deviceStatus: 'stale',
        profile: 'available',
      } as const,
    };
    act(() => {
      tree = renderer.create(
        withTheme(<RichDayGraphChart locale="en" model={partial} />),
      );
    });
    expect(
      tree.root.findAllByProps({testID: 'day-graph-source-status'}).length,
    ).toBeGreaterThan(0);
    const messages = tree.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(messages).toContain(
      'Boluses, temporary basal and recorded carbs: could not load.',
    );
    expect(messages).toContain(
      'Active insulin and active carbs: showing a previous copy.',
    );
    expect(messages).not.toContain('No bolus records in this range');
    act(() =>
      tree.update(withTheme(<RichDayGraphChart locale="en" model={model} />)),
    );
    expect(
      tree.root.findAllByProps({testID: 'day-graph-source-status'}),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByType(Text).map(node => node.props.children),
    ).toContain('No bolus records in this range');
  });

  it('updates surfaces, labels and every series from the active theme without resetting exploration or fullscreen', () => {
    const seriesModel = buildDayGraph({
      period: {dayStartMs: 0, dayEndMs: 24 * HOUR},
      expectedSampleIntervalMs: 5 * 60000,
      glucoseSamples: [0, 1].map(index => ({
        identity: {sourceId: 'fixture', recordId: `glucose-${index}`},
        timestampMs: 8 * HOUR + index * 5 * 60000,
        valueMgDl: 120,
      })),
      activeLoadSamples: [0, 1].map(index => ({
        timestampMs: 8 * HOUR + index * 5 * 60000,
        iobUnits: 1.5 - index * 0.1,
        cobGrams: 30 - index,
      })),
      insulinEvents: [{kind: 'bolus', timestampMs: 8 * HOUR, units: 1.25}],
      basalSchedule: [{secondsFromMidnight: 0, rateUnitsPerHour: 0.75}],
      timelineItems: [],
    });
    const calm = getThemeById('calmBlue');
    const sunset = getThemeById('sunsetGlow');
    const custom: ThemeType = {
      ...sunset,
      chart: {
        basal: '#123456',
        bolus: '#654321',
        iob: '#234567',
        cob: '#765432',
      },
    };
    const dark = getThemeById('darkFocus');
    const content = (theme: ThemeType) =>
      withTheme(<RichDayGraphChart locale="en" model={seriesModel} />, theme);
    const expectTheme = (theme: ThemeType) => {
      const shell = tree.root
        .findAllByProps({testID: 'day-graph-rich-chart'})
        .find(node => node.type === View);
      expect(StyleSheet.flatten(shell!.props.style)).toMatchObject({
        backgroundColor: theme.white,
        borderColor: theme.borderColor,
      });
      expect(
        tree.root
          .findAllByType(SvgText)
          .some(label => label.props.fill === theme.textColor),
      ).toBe(true);
      for (const [testID, color, prop, component] of [
        ['basal-scheduled-segment', theme.chart.basal, 'stroke', Line],
        ['bolus-dose-bar', theme.chart.bolus, 'fill', Rect],
        ['iob-line-segment', theme.chart.iob, 'stroke', Path],
        ['cob-line-segment', theme.chart.cob, 'stroke', Path],
      ] as const) {
        const marks = tree.root
          .findAllByType(component)
          .filter(mark => mark.props.testID === testID);
        expect(marks.length).toBeGreaterThan(0);
        expect(marks.map(mark => mark.props[prop])).toEqual(
          marks.map(() => color),
        );
      }
      if (
        !control(tree, 'chart-inspector-toggle-details').props
          .accessibilityState.expanded
      ) {
        press(tree, 'chart-inspector-toggle-details');
      }
      const inspector = tree.root.findByType(HomeChartsTooltip);
      const inspectorColors = inspector
        .findAllByType(Text)
        .map(label => StyleSheet.flatten(label.props.style)?.color);
      expect(inspectorColors).toEqual(
        expect.arrayContaining(Object.values(theme.chart)),
      );
      expect(
        StyleSheet.flatten(control(tree, 'day-graph-range-3').props.style),
      ).toMatchObject({backgroundColor: theme.buttonBackgroundColor});
    };
    act(() => {
      tree = renderer.create(content(calm));
    });
    press(tree, 'day-graph-range-3');
    const before = domain(tree);
    expectTheme(calm);
    for (const theme of [sunset, custom]) {
      act(() => tree.update(content(theme)));
      expectTheme(theme);
      expect(domain(tree)).toEqual(before);
    }
    press(tree, 'day-graph-chart-mode-combined');
    expectTheme(custom);
    press(tree, 'chart.cgmGraph.fullscreenButton');
    act(() => tree.update(content(dark)));
    expect(tree.root.findAllByType(Modal)).toHaveLength(1);
    expectTheme(dark);
    expect(domain(tree)).toEqual(before);
    press(tree, 'day-graph-fullscreen-close');
    expectTheme(dark);
    expect(domain(tree)).toEqual(before);
  });

  it('automatically remembers mode and requires explicit saving for exploratory zoom', async () => {
    const runtime = {
      ...preferences(),
      value: {schemaVersion: 1, mode: 'mixed', windowHours: 6} as const,
    };
    act(() => {
      tree = renderer.create(
        withTheme(
          <RichDayGraphChart locale="he" model={model} preferences={runtime} />,
        ),
      );
    });
    expect(chart(tree).chartMode).toBe('mixed');
    expect(domain(tree)).toEqual([5 * HOUR, 11 * HOUR]);
    press(tree, 'day-graph-chart-mode-detailed');
    await act(async () => undefined);
    expect(runtime.onSave).toHaveBeenCalledWith({
      schemaVersion: 1,
      mode: 'separate',
      windowHours: 6,
    });
    press(tree, 'day-graph-range-12');
    expect(runtime.onSave).toHaveBeenCalledTimes(1);
    await act(async () => {
      await control(tree, 'day-graph-remember-view').props.onPress();
    });
    expect(runtime.onSave).toHaveBeenCalledWith({
      schemaVersion: 1,
      mode: 'separate',
      windowHours: 12,
    });
    expect(runtime.onSave).toHaveBeenCalledTimes(2);
    expect(control(tree, 'day-graph-remember-view').props.disabled).toBe(true);
  });

  it('mounts only one chart and retains mode, zoom and window when opening or closing fullscreen', () => {
    act(() => {
      tree = renderer.create(
        withTheme(<RichDayGraphChart locale="he" model={model} />),
      );
    });
    press(tree, 'day-graph-chart-mode-combined');
    press(tree, 'day-graph-range-3');
    press(tree, 'day-graph-window-later');
    const before = domain(tree);
    const fullscreenButton = control(tree, 'chart.cgmGraph.fullscreenButton');
    expect(fullscreenButton.props.accessibilityLabel).toBe('מסך מלא');
    act(() => {
      fullscreenButton.props.onPress();
    });
    expect(tree.root.findAllByType(StackedHomeCharts)).toHaveLength(1);
    expect(chart(tree).chartMode).toBe('mixed');
    expect(domain(tree)).toEqual(before);
    expect(chart(tree).showFullScreenButton).toBe(false);
    press(tree, 'day-graph-fullscreen-close');
    expect(domain(tree)).toEqual(before);
    expect(chart(tree).chartMode).toBe('mixed');
    press(tree, 'chart.cgmGraph.fullscreenButton');
    act(() => {
      tree.root.findByType(Modal).props.onRequestClose();
    });
    expect(tree.root.findAllByType(Modal)).toHaveLength(0);
    expect(domain(tree)).toEqual(before);
  });

  it('focuses events without storing their time and restores the saved window on another day', () => {
    const runtime = {
      ...preferences(),
      value: {schemaVersion: 1, mode: 'mixed', windowHours: 12} as const,
    };
    act(() => {
      tree = renderer.create(
        withTheme(
          <RichDayGraphChart
            locale="en"
            model={model}
            preferences={runtime}
            selectedTimestampMs={8 * HOUR}
          />,
        ),
      );
    });
    expect(domain(tree)).toEqual([6.5 * HOUR, 9.5 * HOUR]);
    expect(runtime.onSave).not.toHaveBeenCalled();
    act(() => {
      tree.update(
        withTheme(
          <RichDayGraphChart
            locale="en"
            model={modelFor(24 * HOUR)}
            preferences={runtime}
          />,
        ),
      );
    });
    expect(domain(tree)).toEqual([26 * HOUR, 38 * HOUR]);
    expect(chart(tree).chartMode).toBe('mixed');
    expect(runtime.onSave).not.toHaveBeenCalled();
  });

  it.each([23, 25])(
    'uses the actual local day length (%s hours), not a fixed 24-hour interval',
    hours => {
      act(() => {
        tree = renderer.create(
          withTheme(
            <RichDayGraphChart locale="en" model={modelFor(0, hours * HOUR)} />,
          ),
        );
      });
      expect(domain(tree)).toEqual([0, hours * HOUR]);
      press(tree, 'day-graph-range-12');
      press(tree, 'day-graph-window-later');
      expect(domain(tree)[1]).toBe(hours * HOUR);
    },
  );

  it('shows a local-save error and allows retry without hiding or resetting the chart', async () => {
    const onSave = jest
      .fn<Promise<void>, [unknown]>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);
    act(() => {
      tree = renderer.create(
        withTheme(
          <RichDayGraphChart
            locale="he"
            model={model}
            preferences={preferences(onSave)}
          />,
        ),
      );
    });
    press(tree, 'day-graph-range-6');
    const before = domain(tree);
    await act(async () => {
      await control(tree, 'day-graph-remember-view').props.onPress();
    });
    expect(
      tree.root.findByProps({testID: 'day-graph-preferences-error'}),
    ).toBeTruthy();
    expect(domain(tree)).toEqual(before);
    expect(control(tree, 'day-graph-remember-view').props.disabled).toBe(false);
    await act(async () => {
      await control(tree, 'day-graph-remember-view').props.onPress();
    });
    expect(
      tree.root.findAllByProps({testID: 'day-graph-preferences-error'}),
    ).toHaveLength(0);
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('coalesces repeated saves and does not overwrite newer exploration when an earlier save resolves', async () => {
    let complete = () => {};
    const onSave = jest.fn(
      () =>
        new Promise<void>(resolve => {
          complete = resolve;
        }),
    );
    const runtime = {
      ...preferences(onSave),
      value: {
        schemaVersion: 1,
        mode: 'mixed',
        windowHours: 'full-day',
      } as const,
    };
    act(() => {
      tree = renderer.create(
        withTheme(
          <RichDayGraphChart locale="en" model={model} preferences={runtime} />,
        ),
      );
    });
    press(tree, 'day-graph-chart-mode-combined');
    press(tree, 'day-graph-range-3');
    const save = control(tree, 'day-graph-remember-view').props.onPress;
    act(() => {
      save();
      save();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    press(tree, 'day-graph-range-6');
    await act(async () => {
      complete();
      tree.update(
        withTheme(
          <RichDayGraphChart
            locale="en"
            model={model}
            preferences={{
              ...runtime,
              value: {schemaVersion: 1, mode: 'mixed', windowHours: 3},
            }}
          />,
        ),
      );
    });
    expect(domain(tree)).toEqual([5 * HOUR, 11 * HOUR]);
    expect(control(tree, 'day-graph-remember-view').props.disabled).toBe(false);
  });

  it('ignores a previous scope save after switching to another device profile', async () => {
    let complete = () => {};
    const onSave = jest.fn(
      () =>
        new Promise<void>(resolve => {
          complete = resolve;
        }),
    );
    act(() => {
      tree = renderer.create(
        withTheme(
          <RichDayGraphChart
            locale="en"
            model={model}
            preferences={preferences(onSave)}
          />,
        ),
      );
    });
    press(tree, 'day-graph-range-3');
    press(tree, 'day-graph-remember-view');
    press(tree, 'chart.cgmGraph.fullscreenButton');
    const tablet = {
      ...preferences(),
      scopeKey: 'user-1:tablet',
      layout: 'tablet' as const,
      value: {schemaVersion: 1, mode: 'mixed', windowHours: 12} as const,
    };
    act(() => {
      tree.update(
        withTheme(
          <RichDayGraphChart locale="en" model={model} preferences={tablet} />,
        ),
      );
    });
    await act(async () => {
      complete();
    });
    expect(tree.root.findByType(Modal)).toBeTruthy();
    expect(chart(tree).chartMode).toBe('mixed');
    expect(domain(tree)).toEqual([2 * HOUR, 14 * HOUR]);
    expect(control(tree, 'day-graph-remember-view').props.disabled).toBe(true);
  });
});
