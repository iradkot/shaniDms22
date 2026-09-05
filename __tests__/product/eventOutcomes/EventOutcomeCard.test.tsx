import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import type {DayGraphDataSource} from 'app/modules/dayGraph';
import {EventOutcomeCard} from 'app/product/eventOutcomes';

const minute = 60_000;

const dataSource = (): DayGraphDataSource => ({
  loadDayGraph: jest.fn(async period => ({
    glucoseSamples: Array.from({length: 44}, (_, index) => ({
      identity: {sourceId: 'nightscout', recordId: `bg-${index}`},
      timestampMs: period.dayStartMs + index * 5 * minute,
      valueMgDl: index < 7 ? 100 : index < 20 ? 150 : 110,
    })),
    timelineItems: [],
    freshness: {kind: 'fresh' as const, fetchedAtMs: period.dayEndMs},
  })),
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('EventOutcomeCard', () => {
  it('renders inspectable bilingual evidence and the non-causal caveat', async () => {
    const source = dataSource();
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <EventOutcomeCard
          dataSource={source}
          locale="he"
          subject={{kind: 'meal', id: 'meal-a', startedAtMs: 1_700_000_000_000}}
        />,
      );
    });
    await flush();

    const text = tree!.root
      .findAllByType('Text' as never)
      .map(node => String(node.props.children))
      .join(' ');
    expect(text).toContain('הסוכר שנצפה סביב האירוע');
    expect(text).toContain('כיסוי נתונים');
    expect(text).toContain('אינו מוכיח');
    expect(source.loadDayGraph).toHaveBeenCalledTimes(1);
  });

  it('loads disclosed comparable meals only on demand', async () => {
    const source = dataSource();
    const start = 1_700_000_000_000;
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <EventOutcomeCard
          comparableMeals={[
            {
              id: 'meal-a',
              mealStartMs: start,
              name: 'Pasta',
              tags: ['dinner'],
              carbohydratesGrams: 60,
            },
            {
              id: 'meal-b',
              mealStartMs: start - 7 * 24 * 60 * minute,
              name: 'pasta',
              tags: ['dinner'],
              carbohydratesGrams: 62,
            },
            {
              id: 'meal-c',
              mealStartMs: start - 14 * 24 * 60 * minute,
              name: 'Pasta',
              tags: ['dinner'],
              carbohydratesGrams: 58,
            },
          ]}
          dataSource={source}
          locale="en"
          subject={{kind: 'meal', id: 'meal-a', startedAtMs: start}}
        />,
      );
    });
    await flush();
    expect(source.loadDayGraph).toHaveBeenCalledTimes(1);

    await act(async () => {
      await tree!.root
        .findByProps({testID: 'event-outcome-compare-meals'})
        .props.onPress();
    });
    await flush();

    expect(source.loadDayGraph).toHaveBeenCalledTimes(3);
    expect(
      tree!.root.findAllByProps({
        testID: 'event-outcome-repeated-observation',
      }).length,
    ).toBeGreaterThan(0);
  });
});
