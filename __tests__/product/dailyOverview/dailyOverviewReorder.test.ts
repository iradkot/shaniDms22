import {
  edgeScrollVelocity,
  makePositions,
  movePosition,
  reorderIds,
} from 'app/product/dailyOverview/dailyOverviewReorder';

const ids = ['ranges', 'average', 'metrics', 'insulin', 'coverage'];

describe('daily overview reordering', () => {
  test('moves the first card to the last slot and keeps all other cards in order', () => {
    expect(reorderIds(ids, 'ranges', 4)).toEqual([
      'average',
      'metrics',
      'insulin',
      'coverage',
      'ranges',
    ]);
    expect(reorderIds(ids, 'coverage', 0)).toEqual([
      'coverage',
      'ranges',
      'average',
      'metrics',
      'insulin',
    ]);
    expect(ids[0]).toBe('ranges');
  });

  test('clamps keyboard moves and ignores missing cards or invalid targets', () => {
    expect(reorderIds(ids, 'ranges', -1)).toEqual(ids);
    expect(reorderIds(ids, 'coverage', 99)).toEqual(ids);
    expect(reorderIds(ids, 'missing', 2)).toEqual(ids);
    expect(reorderIds(ids, 'ranges', Number.NaN)).toEqual(ids);
  });

  test('provisional moves keep a complete permutation and preserve the cancellation snapshot', () => {
    const initial = makePositions(ids);
    let provisional = initial;
    for (const target of [1, 2, 4, 3, 0, 4]) {
      provisional = movePosition(provisional, 'ranges', target);
      const order = [...ids].sort(
        (a, b) => (provisional[a] ?? 0) - (provisional[b] ?? 0),
      );
      expect(order).toEqual(reorderIds(ids, 'ranges', target));
      expect(Object.values(provisional).sort()).toEqual([0, 1, 2, 3, 4]);
      expect(initial).toEqual({
        ranges: 0,
        average: 1,
        metrics: 2,
        insulin: 3,
        coverage: 4,
      });
    }
  });

  test('scrolls progressively at both edges, with no drift in the center', () => {
    expect(edgeScrollVelocity(195, 390)).toBe(0);
    expect(edgeScrollVelocity(32, 390)).toBe(-240);
    expect(edgeScrollVelocity(358, 390)).toBe(240);
    expect(edgeScrollVelocity(-100, 390)).toBe(-480);
    expect(edgeScrollVelocity(500, 390)).toBe(480);
  });
});
