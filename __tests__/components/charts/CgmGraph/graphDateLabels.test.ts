import {buildGraphDateLabels} from '../../../../src/components/charts/CgmGraph/components/GraphDateDisplay';

describe('buildGraphDateLabels', () => {
  it('centers one date over a selected local day instead of clipping it at the edges', () => {
    const start = new Date(2026, 8, 3, 0, 0, 0, 0);
    const end = new Date(2026, 8, 4, 0, 0, 0, 0);

    const labels = buildGraphDateLabels(start.getTime(), end.getTime());

    expect(labels).toHaveLength(1);
    expect(labels[0]?.date.getDate()).toBe(3);
    expect(labels[0]?.positionRatio).toBeCloseTo(0.5);
  });

  it('places each date at the center of its visible segment', () => {
    const start = new Date(2026, 8, 3, 18, 0, 0, 0);
    const end = new Date(2026, 8, 5, 6, 0, 0, 0);

    const labels = buildGraphDateLabels(start.getTime(), end.getTime());

    expect(labels.map(label => label.date.getDate())).toEqual([3, 4, 5]);
    expect(labels.map(label => label.positionRatio)).toEqual(
      [...labels.map(label => label.positionRatio)].sort((a, b) => a - b),
    );
    labels.forEach(label => {
      expect(label.positionRatio).toBeGreaterThan(0);
      expect(label.positionRatio).toBeLessThan(1);
    });
  });
});
