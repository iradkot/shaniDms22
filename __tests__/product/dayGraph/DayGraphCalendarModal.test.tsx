import React from 'react';
import {Modal, Pressable, StyleSheet, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {withTheme} from '../../mocks/withTheme';
import {
  DayGraphCalendarModal,
  type DayGraphCalendarModalProps,
} from 'app/product/dayGraph/DayGraphCalendarModal';

const day = (month: number, date = 1, year = 2026) =>
  new Date(year, month - 1, date).getTime();
const control = (tree: renderer.ReactTestRenderer, testID: string) => {
  const result = tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable);
  if (!result) {
    throw new Error(`Missing calendar control ${testID}`);
  }
  return result;
};

describe('DayGraphCalendarModal', () => {
  let tree: renderer.ReactTestRenderer;
  let props: DayGraphCalendarModalProps;
  const mount = () => {
    act(() => {
      tree = renderer.create(withTheme(<DayGraphCalendarModal {...props} />));
    });
  };
  const press = (id: string) => {
    act(() => control(tree, id).props.onPress());
  };
  beforeEach(() => {
    props = {
      locale: 'en',
      selectedDayStartMs: day(9, 2),
      todayStartMs: day(9, 7),
      monthStartMs: day(9),
      targetMinMgDl: 70,
      targetMaxMgDl: 180,
      days: [
        {
          dayStartMs: day(9, 1),
          status: 'data',
          timeInRangePct: 0,
          coveragePct: 100,
          partial: false,
        },
        {
          dayStartMs: day(9, 2),
          status: 'data',
          timeInRangePct: 100,
          coveragePct: 2,
          partial: true,
        },
        {
          dayStartMs: day(9, 3),
          status: 'empty',
          timeInRangePct: null,
          coveragePct: 0,
          partial: false,
        },
      ],
      loading: false,
      failed: false,
      stale: false,
      onChangeMonth: jest.fn(),
      onSelectDay: jest.fn(),
      onClose: jest.fn(),
      onRetry: jest.fn(),
    };
  });
  afterEach(() => {
    if (tree) {
      act(() => tree.unmount());
    }
  });

  it('selects a local calendar day and provides a separate today shortcut', () => {
    mount();
    press('day-graph-calendar-day-2026-09-01');
    expect(props.onSelectDay).toHaveBeenLastCalledWith(day(9, 1));
    press('day-graph-calendar-today');
    expect(props.onSelectDay).toHaveBeenLastCalledWith(day(9, 7));
    expect(props.onChangeMonth).not.toHaveBeenCalled();
    expect(
      control(tree, 'day-graph-calendar-day-2026-09-02').props
        .accessibilityState.selected,
    ).toBe(true);
  });

  it('guards future dates and months even when handlers are called directly', () => {
    mount();
    expect(
      control(tree, 'day-graph-calendar-day-2026-09-08').props.disabled,
    ).toBe(true);
    press('day-graph-calendar-day-2026-09-08');
    press('day-graph-calendar-next-month');
    expect(props.onSelectDay).not.toHaveBeenCalled();
    expect(props.onChangeMonth).not.toHaveBeenCalled();
  });

  it('browses months without changing the selected graph day', () => {
    props = {...props, monthStartMs: day(8)};
    mount();
    press('day-graph-calendar-previous-month');
    expect(props.onChangeMonth).toHaveBeenLastCalledWith(day(7));
    press('day-graph-calendar-next-month');
    expect(props.onChangeMonth).toHaveBeenLastCalledWith(day(9));
    expect(props.onSelectDay).not.toHaveBeenCalled();
  });

  it('jumps directly to a historical month and rejects invalid years', () => {
    mount();
    press('day-graph-calendar-jump');
    const yearInput = tree.root.findByType(TextInput);
    act(() => yearInput.props.onChangeText('2024'));
    press('day-graph-calendar-jump-month-2');
    expect(props.onChangeMonth).toHaveBeenLastCalledWith(day(2, 1, 2024));
    expect(props.onSelectDay).not.toHaveBeenCalled();
    press('day-graph-calendar-jump');
    act(() => tree.root.findByType(TextInput).props.onChangeText('9999'));
    press('day-graph-calendar-jump-month-2');
    expect(props.onChangeMonth).toHaveBeenCalledTimes(1);
  });

  it('distinguishes zero TIR, partial records, checked empty and unknown days', () => {
    mount();
    const label = (date: string) =>
      control(tree, `day-graph-calendar-day-${date}`).props.accessibilityLabel;
    expect(label('2026-09-01')).toContain('0% of recorded readings in range');
    expect(label('2026-09-02')).toContain('100% of recorded readings in range');
    expect(label('2026-09-02')).toContain('2% estimated coverage');
    expect(label('2026-09-02')).toContain('Partial data');
    expect(label('2026-09-03')).toContain('No readings found');
    expect(label('2026-09-04')).toContain('Not checked');
    const text = tree.root.findAllByType(Text).map(node => node.props.children);
    expect(text).toContain('% of recorded readings · 70–180 mg/dL');
    expect(text).toContain('A high percentage does not mean a complete day.');
    expect(text).toContain('100% •');
  });

  it('localizes labels and reverses the visual week for Hebrew', () => {
    props = {...props, locale: 'he'};
    mount();
    expect(
      control(tree, 'day-graph-calendar-today').props.accessibilityLabel,
    ).toBe('מעבר להיום');
    expect(
      control(tree, 'day-graph-calendar-day-2026-09-02').props
        .accessibilityLabel,
    ).toContain('נתונים חלקיים');
    expect(
      tree.root.findAllByType(Text).map(node => node.props.children),
    ).toContain('% מהקריאות שנרשמו · \u206670–180 mg/dL\u2069');
    const weekday = tree.root
      .findAllByType(Text)
      .find(node => node.props.children === 'א׳');
    expect(StyleSheet.flatten(weekday?.parent?.props.style).flexDirection).toBe(
      'row-reverse',
    );
  });

  it('uses the configured target range and renders leap days in a historical month', () => {
    props = {
      ...props,
      monthStartMs: day(2, 1, 2024),
      targetMinMgDl: 80,
      targetMaxMgDl: 160,
    };
    mount();
    press('day-graph-calendar-day-2024-02-29');
    expect(props.onSelectDay).toHaveBeenCalledWith(day(2, 29, 2024));
    expect(
      tree.root.findAllByProps({testID: 'day-graph-calendar-day-2024-02-30'}),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByType(Text).map(node => node.props.children),
    ).toContain('% of recorded readings · 80–160 mg/dL');
  });

  it('closes through X, backdrop and native back, and retries a failed load', () => {
    props = {...props, failed: true, stale: true};
    mount();
    press('day-graph-calendar-close');
    press('day-graph-calendar-backdrop');
    act(() => tree.root.findByType(Modal).props.onRequestClose());
    expect(props.onClose).toHaveBeenCalledTimes(3);
    press('day-graph-calendar-retry');
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(
      tree.root.findAllByType(Text).map(node => node.props.children),
    ).toContain('Saved or partial data');
    expect(tree.root.findByType(Modal).props.supportedOrientations).toEqual([
      'portrait',
      'landscape',
    ]);
  });
});
