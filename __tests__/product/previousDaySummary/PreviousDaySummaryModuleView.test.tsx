import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import type {
  PreviousDaySummaryDataSource,
  PreviousDaySummaryPeriod,
  PreviousDaySummarySourceSnapshot,
} from 'app/modules/previousDaySummary';
import {PreviousDaySummaryModuleView} from 'app/product/previousDaySummary';

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

const localTime = (
  year: number,
  month: number,
  day: number,
  hour: number,
): number => new Date(year, month, day, hour).getTime();

const source = (
  load: (
    period: PreviousDaySummaryPeriod,
  ) => Promise<PreviousDaySummarySourceSnapshot>,
): PreviousDaySummaryDataSource => ({loadPreviousDaySummary: load});

const renderedText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return Array.isArray(value) ? value.map(renderedText).join('') : '';
};

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node => renderedText(node.props.children));

const snapshot = (
  period: PreviousDaySummaryPeriod,
  valueMgDl = 120,
): PreviousDaySummarySourceSnapshot => ({
  glucoseSamples: [
    {timestampMs: period.startMs, valueMgDl},
    {
      timestampMs: period.startMs + (period.endMs - period.startMs) / 2,
      valueMgDl: valueMgDl + 20,
    },
  ],
  insulinSummary: {quality: 'available', basalUnits: 8, bolusUnits: 4},
  events: [
    {
      id: 'meal-1',
      kind: 'meal',
      timestampMs: period.startMs + 8 * 60 * 60 * 1000,
      title: 'Breakfast',
      detail: '35 g',
    },
  ],
});

describe('PreviousDaySummaryModuleView', () => {
  it('presents evidence, a neutral matched comparison, insights, meal observations, and one focus', async () => {
    const hourMs = 60 * 60 * 1000;
    const currentStartMs = localTime(2026, 7, 29, 0);
    const load = jest.fn(async (period: PreviousDaySummaryPeriod) => {
      const isCurrent = period.startMs === currentStartMs;
      return {
        glucoseSamples: Array.from({length: 30}, (_, index) => ({
          timestampMs: period.startMs + index * hourMs,
          valueMgDl: isCurrent
            ? index >= 22
              ? 60
              : 140
            : 120,
        })),
        insulinSummary: {quality: 'unavailable'} as const,
        events: isCurrent
          ? [
              {
                id: 'meal-1',
                kind: 'meal' as const,
                timestampMs: period.startMs + 12 * hourMs,
                title: 'Lunch',
              },
            ]
          : [],
      };
    });
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <PreviousDaySummaryModuleView
          dataSource={source(load)}
          expectedSampleIntervalMs={hourMs}
          locale="en"
          now={() => localTime(2026, 7, 30, 10)}
          thresholds={thresholds}
        />,
      );
    });

    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Evidence and coverage',
        '30-hour observed window',
        '24-hour interpreted window',
        'The incoming night is context and is not counted in the matched comparison.',
        'Range thresholds: <70 mg/dL, 70–180 mg/dL, >180 mg/dL',
        '30 valid · 0 excluded · 0 duplicates',
        'Matched previous day',
        'Compared with the previous equal 24-hour window using the same glucose thresholds.',
        'Current: 100% coverage',
        'Previous: 100% coverage',
        'Insights',
        'Meal observations',
        'Lunch',
        'Observed for 2 hours after the recorded meal. This does not show what caused the change.',
        'Data coverage: 100% · 2/2 readings',
        'Suggested focus',
        'Review low readings and nearby recorded context in the closing night.',
        'This is an inspection prompt, not a treatment recommendation.',
      ]),
    );
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-focus'}),
    ).toBeTruthy();
    expect(textValues(tree!)).not.toContain('Daily score');
    act(() => tree!.unmount());
  });

  it('renders the 30-hour summary, three segments, coverage, insulin, and linked events', async () => {
    const load = jest.fn(async (period: PreviousDaySummaryPeriod) =>
      snapshot(period),
    );
    const onOpenEvent = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <PreviousDaySummaryModuleView
          dataSource={source(load)}
          expectedSampleIntervalMs={15 * 60 * 60 * 1000}
          locale="en"
          now={() => localTime(2026, 7, 30, 10)}
          onOpenEvent={onOpenEvent}
          thresholds={thresholds}
        />,
      );
    });

    expect(load).toHaveBeenCalledWith({
      startMs: localTime(2026, 7, 29, 0),
      endMs: localTime(2026, 7, 30, 6),
    });
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Previous day summary',
        'Incoming night',
        'Daytime',
        'Closing night',
        'Data coverage',
        'In range',
        'Low',
        'High',
        'Mean',
        'Insulin',
        'Total',
        'Breakfast',
        '35 g',
      ]),
    );
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-insulin-total'})
        .props.children,
    ).toBe('12 U');

    act(() =>
      tree!.root
        .findByProps({testID: 'previous-day-summary-event-meal-meal-1'})
        .props.onPress(),
    );
    expect(onOpenEvent).toHaveBeenCalledWith(
      expect.objectContaining({id: 'meal-1', kind: 'meal'}),
    );
    act(() => tree!.unmount());
  });

  it('marks a pre-06:00 closing night as partial and loads only through now', async () => {
    const nowMs = localTime(2026, 7, 30, 3);
    const load = jest.fn(async (period: PreviousDaySummaryPeriod) => ({
      glucoseSamples: [{timestampMs: period.endMs - 1, valueMgDl: 110}],
      insulinSummary: {quality: 'unavailable'} as const,
      events: [],
    }));
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <PreviousDaySummaryModuleView
          dataSource={source(load)}
          locale="en"
          now={() => nowMs}
          thresholds={thresholds}
        />,
      );
    });

    expect(load.mock.calls[0]?.[0].endMs).toBe(nowMs);
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-partial'}),
    ).toBeTruthy();
    expect(textValues(tree!)).toContain(
      'The closing night is still in progress. Future data is not counted.',
    );
    expect(
      tree!.root.findAllByProps({
        testID: 'previous-day-summary-insulin-total',
      }),
    ).toHaveLength(0);
    expect(textValues(tree!)).toContain(
      'Authoritative insulin data is unavailable for this summary.',
    );
    act(() => tree!.unmount());
  });

  it('keeps the current retrospective available when the comparison source is offline', async () => {
    const load = jest
      .fn<
        Promise<PreviousDaySummarySourceSnapshot>,
        [PreviousDaySummaryPeriod]
      >()
      .mockImplementationOnce(async period => snapshot(period))
      .mockRejectedValueOnce(new Error('comparison offline'));
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <PreviousDaySummaryModuleView
          dataSource={source(load)}
          locale="en"
          now={() => localTime(2026, 7, 30, 10)}
          thresholds={thresholds}
        />,
      );
    });

    expect(
      tree!.root.findAllByProps({testID: 'previous-day-summary-error'}),
    ).toHaveLength(0);
    expect(textValues(tree!)).toContain(
      'A matched comparison is unavailable because one window has no glucose evidence.',
    );
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-mean'}).props
        .children,
    ).toBe('130 mg/dL');
    act(() => tree!.unmount());
  });

  it('uses Hebrew RTL copy and honors a typed day focus', async () => {
    const focusedDayStartMs = localTime(2026, 7, 25, 0);
    const load = jest.fn(async (_period: PreviousDaySummaryPeriod) => ({
      glucoseSamples: [],
      insulinSummary: {quality: 'unavailable'} as const,
      events: [],
    }));
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <PreviousDaySummaryModuleView
          dataSource={source(load)}
          focus={{kind: 'day', dayStartMs: focusedDayStartMs}}
          locale="he"
          now={() => localTime(2026, 7, 30, 10)}
          thresholds={thresholds}
        />,
      );
    });

    expect(load.mock.calls[0]?.[0].startMs).toBe(focusedDayStartMs);
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'סיכום היום הקודם',
        'הלילה שנכנס',
        'שעות היום',
        'הלילה שסגר את היום',
        'ראיות וכיסוי נתונים',
        '30 שעות בחלון הנצפה',
        '24 שעות בחלון המפורש',
        'הלילה שנכנס הוא הקשר ואינו נספר בהשוואה התואמת.',
        'ספי הטווח: <70 mg/dL, 70–180 mg/dL, >180 mg/dL',
        '0 תקינות · 0 הוחרגו · 0 כפילויות',
        'היום הקודם התואם',
        'השוואה לחלון הקודם והשווה באורך 24 שעות, עם אותם ספי סוכר.',
        'אין השוואה תואמת כי באחד החלונות אין ראיות סוכר.',
        'תובנות',
        'מוקד מוצע לבדיקה',
        'כדאי לבדוק את פערי הנתונים בלילה שנכנס.',
        'זו הצעה לבדיקה, לא המלצה לשינוי טיפול.',
        'אין נתונים זמינים בחלון הסיכום הזה.',
      ]),
    );
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-controls'}).props
        .style,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({flexDirection: 'row-reverse'}),
      ]),
    );
    act(() => tree!.unmount());
  });

  it('navigates local summary days and ignores a stale response', async () => {
    const pending: Array<{
      period: PreviousDaySummaryPeriod;
      resolve: (value: PreviousDaySummarySourceSnapshot) => void;
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
        <PreviousDaySummaryModuleView
          dataSource={dataSource}
          expectedSampleIntervalMs={15 * 60 * 60 * 1000}
          locale="en"
          now={() => localTime(2026, 7, 30, 10)}
          thresholds={thresholds}
        />,
      );
    });
    expect(pending).toHaveLength(2);

    act(() =>
      tree!.root
        .findByProps({testID: 'previous-day-summary-previous'})
        .props.onPress(),
    );
    expect(pending).toHaveLength(4);

    await act(async () => {
      pending[2]!.resolve(snapshot(pending[2]!.period, 100));
      pending[3]!.resolve(snapshot(pending[3]!.period, 100));
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-mean'}).props
        .children,
    ).toBe('110 mg/dL');

    await act(async () => {
      pending[0]!.resolve(snapshot(pending[0]!.period, 250));
      pending[1]!.resolve(snapshot(pending[1]!.period, 250));
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-mean'}).props
        .children,
    ).toBe('110 mg/dL');

    act(() =>
      tree!.root
        .findByProps({testID: 'previous-day-summary-next'})
        .props.onPress(),
    );
    expect(pending).toHaveLength(6);
    expect(pending[4]!.period.startMs).toBe(localTime(2026, 7, 29, 0));
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-next'}).props
        .accessibilityState,
    ).toEqual({disabled: true});
    act(() => tree!.unmount());
  });

  it('shows loading, error/retry, and an explicit empty state', async () => {
    const load = jest
      .fn<
        Promise<PreviousDaySummarySourceSnapshot>,
        [PreviousDaySummaryPeriod]
      >()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async () => ({
        glucoseSamples: [],
        insulinSummary: {quality: 'unavailable'},
        events: [],
      }));
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <PreviousDaySummaryModuleView
          dataSource={source(load)}
          locale="en"
          now={() => localTime(2026, 7, 30, 10)}
          thresholds={thresholds}
        />,
      );
    });
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-loading'}),
    ).toBeTruthy();

    await act(async () => {
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-error'}),
    ).toBeTruthy();

    await act(async () => {
      tree!.root
        .findByProps({testID: 'previous-day-summary-retry'})
        .props.onPress();
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(4);
    expect(
      tree!.root.findByProps({testID: 'previous-day-summary-empty'}),
    ).toBeTruthy();
    act(() => tree!.unmount());
  });
});
