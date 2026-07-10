import {
  AgpComparisonEvidence,
  AgpComparisonInsight,
  AgpSegmentComparison,
  AgpSettingsValueDiff,
} from './types';

export function analyzeSettingsDiffs(
  evidence: AgpComparisonEvidence,
): AgpComparisonInsight[] {
  const diffs = evidence.settingsDiffs
    .filter(isImportantSettingDiff)
    .sort(
      (a, b) => settingDiffScore(b, evidence) - settingDiffScore(a, evidence),
    );
  if (!diffs.length) {
    return [];
  }

  const alignedCount = diffs.filter(diff =>
    hasAlignedAgpChange(diff, evidence),
  ).length;
  const reviewLinesHe = diffs
    .slice(0, 4)
    .map(diff => formatPlanReviewHe(diff, evidence));
  const reviewLinesEn = diffs
    .slice(0, 4)
    .map(diff => formatPlanReviewEn(diff, evidence));
  const hasEnoughCoverage =
    evidence.dataQuality.currentCoveragePct >= 70 &&
    evidence.dataQuality.previousCoveragePct >= 70;

  return [
    {
      id: 'settings-diff',
      category: 'settings',
      titleHe: 'המלצות לבדיקה לפי שינויי התכנית',
      titleEn: 'Plan-change review recommendations',
      whatChangedHe: diffs.slice(0, 4).map(formatDiffHe).join(' · '),
      whatChangedEn: diffs.slice(0, 4).map(formatDiffEn).join(' · '),
      possibleDriversHe: [
        ...reviewLinesHe,
        alignedCount
          ? `להתחיל מ־${alignedCount} חלונות שבהם גם התכנית השתנתה וגם ה־AGP השתנה`
          : 'נמצאו שינויי תכנית, אבל אין חלון AGP ברור שמתחבר אליהם ישירות',
        'אם השינוי בתכנית לא יושב על אותו חלון זמן, לבדוק קודם ארוחות, בולוסים או מצב לופ',
        'זו התאמה לבדיקה, לא הוכחת סיבה ולא המלצה לשינוי מינון מתוך המסך',
      ],
      possibleDriversEn: [
        ...reviewLinesEn,
        'If the AGP shift appears in the same window, this is a plausible driver',
        'If timing does not line up, behavior/meals/Loop context are more likely',
      ],
      evidenceHe: [
        `נמצאו ${diffs.length} הבדלים בתכנית בין התקופות`,
        alignedCount
          ? `${alignedCount} מהם נמצאים בחלון שבו גם ה־AGP השתנה בצורה משמעותית`
          : 'לא נמצאה התאמה חזקה בין חלון שינוי התכנית לבין חלון שינוי AGP',
      ],
      evidenceEn: [
        `Found ${diffs.length} settings differences between periods`,
      ],
      confidence: hasEnoughCoverage && alignedCount ? 'medium' : 'low',
    },
  ];
}

function settingDiffScore(
  diff: AgpSettingsValueDiff,
  evidence: AgpComparisonEvidence,
) {
  if (!diff.windowKey) {
    return Math.abs(diff.delta ?? 0);
  }
  const segment = evidence.segments.find(item => item.key === diff.windowKey);
  return (segment?.significanceScore ?? 0) + Math.abs(diff.delta ?? 0);
}

function hasAlignedAgpChange(
  diff: AgpSettingsValueDiff,
  evidence: AgpComparisonEvidence,
) {
  if (!diff.windowKey) {
    return false;
  }
  const segment = evidence.segments.find(item => item.key === diff.windowKey);
  return (segment?.significanceScore ?? 0) >= 25;
}

function isImportantSettingDiff(diff: AgpSettingsValueDiff) {
  const abs = Math.abs(diff.delta ?? 0);
  switch (diff.setting) {
    case 'carbRatio':
    case 'isf':
      return abs >= 0.5;
    case 'basal':
      return abs >= 0.05;
    case 'targetLow':
    case 'targetHigh':
      return abs >= 5;
    case 'dia':
      return abs >= 0.1;
    default:
      return false;
  }
}

function formatDiffHe(diff: AgpSettingsValueDiff) {
  return `${diff.labelHe}: מ־${formatValue(diff.previous)} ל־${formatValue(
    diff.current,
  )}`;
}

function formatDiffEn(diff: AgpSettingsValueDiff) {
  return `${diff.labelEn}: ${formatValue(diff.previous)} -> ${formatValue(
    diff.current,
  )}`;
}

function formatPlanReviewHe(
  diff: AgpSettingsValueDiff,
  evidence: AgpComparisonEvidence,
) {
  const segment = segmentForDiff(diff, evidence);
  const outcome = segment ? summarizeSegmentOutcomeHe(segment) : null;
  const relation = relationForDiff(diff, segment);
  return `${formatDiffHe(diff)}. ${outcome ?? 'אין חלון AGP תואם למדידה ישירה'}. ${relation.he}`;
}

function formatPlanReviewEn(
  diff: AgpSettingsValueDiff,
  evidence: AgpComparisonEvidence,
) {
  const segment = segmentForDiff(diff, evidence);
  const outcome = segment ? summarizeSegmentOutcomeEn(segment) : null;
  const relation = relationForDiff(diff, segment);
  return `${formatDiffEn(diff)}. ${outcome ?? 'No matching AGP window for direct measurement'}. ${relation.en}`;
}

function segmentForDiff(
  diff: AgpSettingsValueDiff,
  evidence: AgpComparisonEvidence,
) {
  return diff.windowKey
    ? evidence.segments.find(item => item.key === diff.windowKey)
    : null;
}

function summarizeSegmentOutcomeHe(segment: AgpSegmentComparison) {
  const tir = segment.deltas.tirPct;
  const avg = segment.deltas.averageBg;
  const low = segment.deltas.lowPct;
  const parts = [
    tir != null
      ? `זמן בטווח ${formatPercentOutcomeHe(
          segment.previous.tirPct,
          segment.current.tirPct,
          tir,
        )}`
      : null,
    avg != null
      ? `ממוצע ${formatNumberOutcomeHe(
          segment.previous.averageBg,
          segment.current.averageBg,
          avg,
          'מ״ג/ד״ל',
        )}`
      : null,
    low != null && Math.abs(low) >= 3
      ? `זמן נמוך ${formatPercentOutcomeHe(
          segment.previous.lowPct,
          segment.current.lowPct,
          low,
        )}`
      : null,
  ].filter(Boolean);
  const direction = outcomeLabelHe(segment);
  return `בפועל בחלון ${segment.labelHe}: ${direction}${
    parts.length ? ` (${parts.join(', ')})` : ''
  }`;
}

function summarizeSegmentOutcomeEn(segment: AgpSegmentComparison) {
  const tir = segment.deltas.tirPct;
  const avg = segment.deltas.averageBg;
  const parts = [
    tir != null
      ? `TIR ${formatPercentOutcomeEn(
          segment.previous.tirPct,
          segment.current.tirPct,
          tir,
        )}`
      : null,
    avg != null
      ? `average glucose ${formatNumberOutcomeEn(
          segment.previous.averageBg,
          segment.current.averageBg,
          avg,
          'mg/dL',
        )}`
      : null,
  ].filter(Boolean);
  return `actual ${segment.labelEn} outcome: ${outcomeLabelEn(segment)}${
    parts.length ? ` (${parts.join(', ')})` : ''
  }`;
}

function outcomeLabelHe(segment: AgpSegmentComparison) {
  const score = outcomeScore(segment);
  if (score >= 1.5) {
    return 'נראה שיפור';
  }
  if (score <= -1.5) {
    return 'נראה החמרה';
  }
  return 'השינוי מעורב או לא חד';
}

function outcomeLabelEn(segment: AgpSegmentComparison) {
  const score = outcomeScore(segment);
  if (score >= 1.5) {
    return 'appears improved';
  }
  if (score <= -1.5) {
    return 'appears worse';
  }
  return 'mixed or unclear';
}

function outcomeScore(segment: AgpSegmentComparison) {
  let score = 0;
  const tir = segment.deltas.tirPct ?? 0;
  const avg = segment.deltas.averageBg ?? 0;
  const low = segment.deltas.lowPct ?? 0;
  if (tir >= 8) {
    score += 2;
  } else if (tir <= -8) {
    score -= 2;
  }
  if (avg <= -18) {
    score += 1;
  } else if (avg >= 18) {
    score -= 1;
  }
  if (low >= 5) {
    score -= 2;
  } else if (low <= -5) {
    score += 1;
  }
  return score;
}

function relationForDiff(
  diff: AgpSettingsValueDiff,
  segment: AgpSegmentComparison | null | undefined,
) {
  if (!segment || segment.significanceScore < 25) {
    return {
      he: 'לא הייתי מייחס את זה לתכנית בלי לבדוק קודם ארוחות, בולוסים, לופ ואיכות נתונים.',
      en: 'Do not attribute this to the plan before checking meals, boluses, Loop context, and data quality.',
    };
  }
  if (isDiffDirectionConsistentWithSegment(diff, segment)) {
    return {
      he: 'זה יכול להיות קשור לשינוי בתכנית, אבל עדיין זו התאמה לבדיקה ולא הוכחת סיבה.',
      en: 'This may be related to the plan change, but it is still a review direction, not proof of cause.',
    };
  }
  return {
    he: 'יש שינוי באותו חלון, אבל הכיוון לא מספיק חד כדי להגיד שזה כנראה בגלל התכנית.',
    en: 'There is a change in the same window, but the direction is not clear enough to point to the plan.',
  };
}

function isDiffDirectionConsistentWithSegment(
  diff: AgpSettingsValueDiff,
  segment: AgpSegmentComparison,
) {
  const expected = expectedBgDirectionFromSetting(diff);
  const observed = observedBgDirection(segment);
  return expected !== 0 && observed !== 0 && expected === observed;
}

function expectedBgDirectionFromSetting(diff: AgpSettingsValueDiff) {
  const delta = diff.delta ?? 0;
  if (Math.abs(delta) < 0.01) {
    return 0;
  }
  switch (diff.setting) {
    case 'carbRatio':
    case 'isf':
    case 'targetLow':
    case 'targetHigh':
      return delta > 0 ? 1 : -1;
    case 'basal':
      return delta > 0 ? -1 : 1;
    default:
      return 0;
  }
}

function observedBgDirection(segment: AgpSegmentComparison) {
  const avg = segment.deltas.averageBg ?? 0;
  const tir = segment.deltas.tirPct ?? 0;
  const low = segment.deltas.lowPct ?? 0;
  if (avg >= 18 || tir <= -8) {
    return 1;
  }
  if (avg <= -18 || (tir >= 8 && low < 5)) {
    return -1;
  }
  return 0;
}

function formatPercentOutcomeHe(
  previous: number | null,
  current: number | null,
  delta: number,
) {
  if (previous == null || current == null) {
    return `השתנה ב־${formatSigned(delta)} נקודות אחוז`;
  }
  return `${delta >= 0 ? 'עלה' : 'ירד'} מ־${previous.toFixed(
    0,
  )}% ל־${current.toFixed(0)}%`;
}

function formatPercentOutcomeEn(
  previous: number | null,
  current: number | null,
  delta: number,
) {
  if (previous == null || current == null) {
    return `changed by ${formatSigned(delta)} percentage points`;
  }
  return `${delta >= 0 ? 'rose' : 'fell'} from ${previous.toFixed(
    0,
  )}% to ${current.toFixed(0)}%`;
}

function formatNumberOutcomeHe(
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

function formatNumberOutcomeEn(
  previous: number | null,
  current: number | null,
  delta: number,
  unit: string,
) {
  if (previous == null || current == null) {
    return `changed by ${formatSigned(delta)} ${unit}`;
  }
  return `${delta >= 0 ? 'rose' : 'fell'} from ${previous.toFixed(
    0,
  )} to ${current.toFixed(0)} ${unit}`;
}

function formatSigned(value: number) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? '+' : ''}${rounded}`;
}

function formatValue(value: number | null) {
  return value == null ? '-' : Number(value.toFixed(2)).toString();
}
