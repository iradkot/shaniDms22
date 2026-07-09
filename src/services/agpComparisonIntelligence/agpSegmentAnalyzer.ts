import {
  AgpComparisonEvidence,
  AgpComparisonInsight,
  AgpInsightConfidence,
  AgpSegmentComparison,
} from './types';

const MAX_PATTERN_INSIGHTS = 4;

export function analyzeAgpSegments(
  evidence: AgpComparisonEvidence,
): AgpComparisonInsight[] {
  return evidence.segments
    .filter(hasMeaningfulAgpChange)
    .slice(0, MAX_PATTERN_INSIGHTS)
    .map(segment => buildSegmentInsight(segment, evidence));
}

function hasMeaningfulAgpChange(segment: AgpSegmentComparison) {
  return (
    Math.abs(segment.deltas.tirPct ?? 0) >= 8 ||
    Math.abs(segment.deltas.averageBg ?? 0) >= 18 ||
    Math.abs(segment.deltas.lowPct ?? 0) >= 5 ||
    Math.abs(segment.deltas.variabilityBand ?? 0) >= 25
  );
}

function buildSegmentInsight(
  segment: AgpSegmentComparison,
  evidence: AgpComparisonEvidence,
): AgpComparisonInsight {
  const isHigher =
    (segment.deltas.averageBg ?? segment.deltas.medianBg ?? 0) > 0;
  const tirDelta = segment.deltas.tirPct;
  const avgDelta = segment.deltas.averageBg;
  const bandDelta = segment.deltas.variabilityBand;
  const lowDelta = segment.deltas.lowPct;
  const confidence = confidenceForSegment(segment, evidence);
  const settings = settingsContextForSegment(segment, evidence);

  const possibleDriversHe: string[] = [];
  const possibleDriversEn: string[] = [];

  if (segment.key === 'overnight' || segment.key === 'bedtime') {
    possibleDriversHe.push(
      'בזאל/יעד לילה שונים',
      'תיקון מאוחר או ספיגה מאוחרת מארוחת ערב',
    );
    possibleDriversEn.push(
      'Different overnight basal/target',
      'Late correction or delayed dinner absorption',
    );
  } else if (
    segment.key === 'breakfast' ||
    segment.key === 'midday' ||
    segment.key === 'evening'
  ) {
    possibleDriversHe.push(
      'תזמון בולוס',
      'יחס פחמימות',
      'הערכת פחמימות או ספיגה ארוכה',
    );
    possibleDriversEn.push(
      'Bolus timing',
      'Carb ratio',
      'Carb estimate or prolonged absorption',
    );
  } else {
    possibleDriversHe.push('רגישות לאינסולין', 'תיקונים', 'שינוי פעילות/שגרה');
    possibleDriversEn.push(
      'Insulin sensitivity',
      'Corrections',
      'Activity/routine change',
    );
  }

  if (!isHigher && (lowDelta ?? 0) > 3) {
    possibleDriversHe.unshift('יותר מדי אינסולין פעיל בחלון הזה');
    possibleDriversEn.unshift('More active insulin than needed in this window');
  }

  return {
    id: `agp-${segment.key}`,
    category:
      segment.key === 'overnight' || segment.key === 'bedtime'
        ? 'overnight'
        : segment.key === 'morning'
        ? 'morning'
        : 'agp_pattern',
    titleHe: `${segment.labelHe}: ${
      isHigher ? 'גבוה יותר' : 'נמוך יותר'
    } בתקופה הנוכחית`,
    titleEn: `${segment.labelEn}: ${
      isHigher ? 'higher' : 'lower'
    } in the current period`,
    whatChangedHe: [
      tirDelta != null
        ? `זמן בטווח ${formatPercentChangeHe(
            segment.previous.tirPct,
            segment.current.tirPct,
            tirDelta,
          )}`
        : null,
      avgDelta != null
        ? `ממוצע הסוכר ${formatNumberChangeHe(
            segment.previous.averageBg,
            segment.current.averageBg,
            avgDelta,
            'מ״ג/ד״ל',
          )}`
        : null,
      bandDelta != null
        ? `רוחב הפיזור ${formatNumberChangeHe(
            segment.previous.variabilityBand,
            segment.current.variabilityBand,
            bandDelta,
            'מ״ג/ד״ל',
          )}`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
    whatChangedEn: [
      tirDelta != null
        ? `TIR changed by ${formatSigned(tirDelta)} points`
        : null,
      avgDelta != null
        ? `Average glucose changed by ${formatSigned(avgDelta)} mg/dL`
        : null,
      bandDelta != null
        ? `P10-P90 spread changed by ${formatSigned(bandDelta)} mg/dL`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
    possibleDriversHe,
    possibleDriversEn,
    evidenceHe: [
      `נוכחי: ${formatStatsHe(segment.current)}`,
      `קודם: ${formatStatsHe(segment.previous)}`,
    ],
    evidenceEn: [
      `Current: ${formatStats(segment.current)}`,
      `Previous: ${formatStats(segment.previous)}`,
    ],
    settingsContextHe: settings?.he,
    settingsContextEn: settings?.en,
    confidence,
    segmentKey: segment.key,
  };
}

function confidenceForSegment(
  segment: AgpSegmentComparison,
  evidence: AgpComparisonEvidence,
): AgpInsightConfidence {
  const enoughSamples =
    segment.current.sampleCount >= 24 && segment.previous.sampleCount >= 24;
  const enoughCoverage =
    evidence.dataQuality.currentCoveragePct >= 70 &&
    evidence.dataQuality.previousCoveragePct >= 70;
  if (enoughSamples && enoughCoverage && segment.significanceScore >= 45) {
    return 'high';
  }
  if (enoughSamples && segment.significanceScore >= 25) {
    return 'medium';
  }
  return 'low';
}

function settingsContextForSegment(
  segment: AgpSegmentComparison,
  evidence: AgpComparisonEvidence,
) {
  const diffs = evidence.settingsDiffs.filter(
    diff => diff.windowKey === segment.key,
  );
  if (!diffs.length) {
    return null;
  }

  const he = diffs
    .slice(0, 3)
    .map(
      diff =>
        `${diff.labelHe}: מ־${formatValue(diff.previous)} ל־${formatValue(
          diff.current,
        )}`,
    )
    .join(' · ');
  const en = diffs
    .slice(0, 3)
    .map(
      diff =>
        `${diff.labelEn}: ${formatValue(diff.previous)} -> ${formatValue(
          diff.current,
        )}`,
    )
    .join(' · ');
  return {he, en};
}

function formatStats(stats: AgpSegmentComparison['current']) {
  return [
    stats.tirPct != null ? `TIR ${stats.tirPct.toFixed(0)}%` : null,
    stats.averageBg != null ? `avg ${stats.averageBg.toFixed(0)}` : null,
    stats.medianBg != null ? `median ${stats.medianBg.toFixed(0)}` : null,
    `${stats.sampleCount} samples`,
  ]
    .filter(Boolean)
    .join(', ');
}

function formatStatsHe(stats: AgpSegmentComparison['current']) {
  return [
    stats.tirPct != null ? `זמן בטווח ${stats.tirPct.toFixed(0)}%` : null,
    stats.averageBg != null ? `ממוצע ${stats.averageBg.toFixed(0)}` : null,
    stats.medianBg != null ? `חציון ${stats.medianBg.toFixed(0)}` : null,
    `${stats.sampleCount} קריאות`,
  ]
    .filter(Boolean)
    .join(', ');
}

function formatSigned(value: number) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? '+' : ''}${rounded}`;
}

function formatPercentChangeHe(
  previous: number | null,
  current: number | null,
  delta: number,
) {
  if (previous == null || current == null) {
    return `השתנה ב־${formatSigned(delta)} נקודות אחוז`;
  }
  return `${delta >= 0 ? 'עלה' : 'ירד'} מ־${previous.toFixed(
    0,
  )}% ל־${current.toFixed(0)}% (${Math.abs(delta).toFixed(0)} נקודות אחוז)`;
}

function formatNumberChangeHe(
  previous: number | null,
  current: number | null,
  delta: number,
  unit: string,
) {
  if (previous == null || current == null) {
    return `השתנה ב־${formatSigned(delta)} ${unit}`;
  }
  return `${delta >= 0 ? 'עלה' : 'ירד'} מ־${previous.toFixed(
    0,
  )} ל־${current.toFixed(0)} ${unit}`;
}

function formatValue(value: number | null) {
  return value == null ? '-' : Number(value.toFixed(2)).toString();
}
