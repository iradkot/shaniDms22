import React from 'react';
import {Modal, Pressable} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {DayGraphModuleView} from 'app/product/dayGraph/DayGraphModuleView';
import type {DayGraphInitialFocus} from 'app/product/dayGraph/DayGraphModuleView';
import {DayGraphCalendarModal} from 'app/product/dayGraph/DayGraphCalendarModal';
import type {DayGraphPeriod} from 'app/modules/dayGraph';
import {withTheme} from '../../mocks/withTheme';

jest.mock('app/product/dayGraph/RichDayGraphChart', () => ({
  RichDayGraphChart: () => null,
}));
const today = new Date(2026, 8, 7).getTime();
const historical = new Date(2026, 8, 3).getTime();
const load = jest.fn(async (period: DayGraphPeriod) => ({
  glucoseSamples: [],
  timelineItems: [],
  freshness: {kind: 'fresh' as const, fetchedAtMs: period.dayStartMs},
}));
const press = async (tree: renderer.ReactTestRenderer, id: string) => {
  await act(async () => {
    tree.root
      .findAllByType(Pressable)
      .find(node => node.props.testID === id)!
      .props.onPress();
  });
};

it('opens on the selected date without jumping to today, allows selection before month data loads, and exposes an explicit today shortcut', async () => {
  // An intentionally pending summary must never prevent selecting a date.
  const calendarLoad = jest.fn(() => new Promise<never>(() => {}));
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      withTheme(
        <DayGraphModuleView
          locale="he"
          now={() => today + 12 * 3_600_000}
          dataSource={{loadDayGraph: load, loadCalendarGlucose: calendarLoad}}
          initialFocus={{kind: 'day', dayStartMs: historical}}
        />,
      ),
    );
  });
  try {
    expect(load).toHaveBeenCalledTimes(1);
    expect(calendarLoad).not.toHaveBeenCalled();
    await press(tree, 'day-graph-pick-date');
    expect(
      tree.root.findByType(DayGraphCalendarModal).props.selectedDayStartMs,
    ).toBe(historical);
    expect(load).toHaveBeenCalledTimes(1);
    expect(calendarLoad).toHaveBeenCalledTimes(1);
    await press(tree, 'day-graph-calendar-previous-month');
    expect(load).toHaveBeenCalledTimes(1);
    await press(tree, 'day-graph-calendar-day-2026-08-12');
    expect(tree.root.findAllByType(DayGraphCalendarModal)).toHaveLength(0);
    expect(load).toHaveBeenLastCalledWith({
      dayStartMs: new Date(2026, 7, 12).getTime(),
      dayEndMs: new Date(2026, 7, 13).getTime(),
    });
    await press(tree, 'day-graph-pick-date');
    expect(tree.root.findByType(DayGraphCalendarModal).props.monthStartMs).toBe(
      new Date(2026, 7, 1).getTime(),
    );
    await act(async () => {
      tree.root.findByType(Modal).props.onRequestClose();
    });
    expect(load).toHaveBeenCalledTimes(2);
    await press(tree, 'day-graph-pick-date');
    await press(tree, 'day-graph-calendar-today');
    expect(load).toHaveBeenLastCalledWith({
      dayStartMs: today,
      dayEndMs: new Date(2026, 8, 8).getTime(),
    });
    expect(tree.root.findAllByType(DayGraphCalendarModal)).toHaveLength(0);
  } finally {
    act(() => tree.unmount());
  }
});

describe('selected calendar date across midnight', () => {
  const tomorrow = new Date(2026, 8, 8).getTime();
  let currentTimeMs: number;
  let tree: renderer.ReactTestRenderer | undefined;
  const now = () => currentTimeMs;
  const source = {loadDayGraph: load};
  const view = (initialFocus?: DayGraphInitialFocus) =>
    withTheme(
      <DayGraphModuleView
        locale="en"
        now={now}
        dataSource={source}
        {...(initialFocus ? {initialFocus} : {})}
      />,
    );
  const mount = async (initialFocus?: DayGraphInitialFocus) => {
    let mounted!: renderer.ReactTestRenderer;
    await act(async () => {
      mounted = renderer.create(view(initialFocus));
      tree = mounted;
    });
    return mounted;
  };
  const crossMidnight = async () => {
    await act(async () => {
      currentTimeMs = tomorrow + 30_000;
      jest.advanceTimersByTime(60_000);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    load.mockClear();
    currentTimeMs = tomorrow - 30_000;
  });
  afterEach(() => {
    if (tree) {
      act(() => tree?.unmount());
      tree = undefined;
    }
    jest.useRealTimers();
  });

  it('keeps a user-picked historical date when the local day changes', async () => {
    const mounted = await mount();
    await press(mounted, 'day-graph-pick-date');
    await press(mounted, 'day-graph-calendar-day-2026-09-03');
    expect(load).toHaveBeenCalledTimes(2);
    await crossMidnight();
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith({
      dayStartMs: historical,
      dayEndMs: new Date(2026, 8, 4).getTime(),
    });
    await press(mounted, 'day-graph-pick-date');
    expect(
      mounted.root.findByType(DayGraphCalendarModal).props.selectedDayStartMs,
    ).toBe(historical);
  });

  it('continues following today when the user was already viewing today', async () => {
    await mount();
    await crossMidnight();
    expect(load).toHaveBeenLastCalledWith({
      dayStartMs: tomorrow,
      dayEndMs: new Date(2026, 8, 9).getTime(),
    });
  });

  it('honors explicit focus navigation, including focus removal, after midnight', async () => {
    const mounted = await mount({kind: 'day', dayStartMs: historical});
    await crossMidnight();
    expect(load).toHaveBeenCalledTimes(1);
    const destination = new Date(2026, 7, 12).getTime();
    await act(async () => {
      mounted.update(view({kind: 'day', dayStartMs: destination}));
    });
    expect(load).toHaveBeenLastCalledWith({
      dayStartMs: destination,
      dayEndMs: new Date(2026, 7, 13).getTime(),
    });
    await act(async () => {
      mounted.update(view());
    });
    expect(load).toHaveBeenLastCalledWith({
      dayStartMs: tomorrow,
      dayEndMs: new Date(2026, 8, 9).getTime(),
    });
  });
});
