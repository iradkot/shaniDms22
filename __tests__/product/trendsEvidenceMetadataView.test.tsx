import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import {TrendsEvidenceMetadataView} from 'app/product/trends';

const renderedText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return Array.isArray(value) ? value.map(renderedText).join('') : '';
};

describe('TrendsEvidenceMetadataView', () => {
  it('shows the full evidence contract in Hebrew', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TrendsEvidenceMetadataView
          locale="he"
          metadata={{
            period: {
              startMs: Date.UTC(2026, 7, 1),
              endMs: Date.UTC(2026, 7, 15),
            },
            coveragePercent: 82,
            coverageQuality: 'adequate',
            daysWithData: 14,
            lastReadingTimestampMs: Date.UTC(2026, 7, 14, 21, 55),
            targetRange: {minMgDl: 70, maxMgDl: 180},
            timeZoneOffsetMinutes: 180,
            freshness: 'current',
            ageAtPeriodEndMs: 5 * 60 * 1000,
          }}
        />,
      );
    });

    const texts = tree!.root
      .findAllByType(Text)
      .map(node => renderedText(node.props.children));
    expect(texts).toEqual(
      expect.arrayContaining([
        'אזור זמן',
        'UTC+03:00',
        'טווח יעד',
        '70–180 mg/dL',
        'ימים עם נתונים',
        '14',
        'נתון אחרון',
      ]),
    );
    act(() => tree!.unmount());
  });
});
