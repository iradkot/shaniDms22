import {hasMeaningfulCorrectionSignal} from './buildComparisonEvidence';
import {AgpComparisonEvidence, AgpComparisonInsight} from './types';

export function analyzeCorrections(
  evidence: AgpComparisonEvidence,
): AgpComparisonInsight[] {
  const corrections = evidence.corrections;
  if (!hasMeaningfulCorrectionSignal(corrections)) {
    return [];
  }

  const dropDelta =
    corrections.currentAvgDrop3h != null &&
    corrections.previousAvgDrop3h != null
      ? corrections.currentAvgDrop3h - corrections.previousAvgDrop3h
      : null;
  const lowDelta =
    corrections.currentLowAfterCorrectionPct != null &&
    corrections.previousLowAfterCorrectionPct != null
      ? corrections.currentLowAfterCorrectionPct -
        corrections.previousLowAfterCorrectionPct
      : null;

  const currentStr = correctionSummary(
    corrections.currentAvgDrop3h,
    corrections.currentLowAfterCorrectionPct,
  );
  const previousStr = correctionSummary(
    corrections.previousAvgDrop3h,
    corrections.previousLowAfterCorrectionPct,
  );
  const currentStrHe = correctionSummaryHe(
    corrections.currentAvgDrop3h,
    corrections.currentLowAfterCorrectionPct,
  );
  const previousStrHe = correctionSummaryHe(
    corrections.previousAvgDrop3h,
    corrections.previousLowAfterCorrectionPct,
  );

  const tooStrong = (dropDelta ?? 0) > 25 || (lowDelta ?? 0) > 15;

  return [
    {
      id: 'corrections',
      category: 'correction',
      titleHe: `תיקונים: ${
        tooStrong ? 'נראים חזקים יותר' : 'נראים חלשים יותר'
      }`,
      titleEn: `Corrections: ${tooStrong ? 'look stronger' : 'look weaker'}`,
      whatChangedHe: [
        dropDelta != null
          ? `הירידה אחרי 3 שעות ${formatNumberChangeHe(
              corrections.previousAvgDrop3h,
              corrections.currentAvgDrop3h,
              dropDelta,
              'מ״ג/ד״ל',
            )}`
          : null,
        lowDelta != null
          ? `זמן נמוך אחרי תיקון ${formatPercentChangeHe(
              corrections.previousLowAfterCorrectionPct,
              corrections.currentLowAfterCorrectionPct,
              lowDelta,
            )}`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      whatChangedEn: [
        dropDelta != null
          ? `3h drop changed by ${formatSigned(dropDelta)} mg/dL`
          : null,
        lowDelta != null
          ? `Low-after-correction changed by ${formatSigned(lowDelta)} points`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      possibleDriversHe: tooStrong
        ? [
            'רגישות לאינסולין חזקה מדי',
            'תיקון מוקדם מדי לפני סיום פעילות אינסולין קודמת',
          ]
        : ['רגישות לאינסולין חלשה מדי', 'תיקון מאוחר מדי או לופ שמפצה לאט'],
      possibleDriversEn: tooStrong
        ? [
            'ISF may be too strong',
            'Correction may happen before prior insulin is done',
          ]
        : [
            'ISF may be too weak',
            'Correction may be late or Loop may be compensating slowly',
          ],
      evidenceHe: [
        `נוכחי: ${corrections.currentCount} תיקונים, ${currentStrHe}`,
        `קודם: ${corrections.previousCount} תיקונים, ${previousStrHe}`,
      ],
      evidenceEn: [
        `Current: ${corrections.currentCount} corrections, ${currentStr}`,
        `Previous: ${corrections.previousCount} corrections, ${previousStr}`,
      ],
      confidence: correctionConfidence(evidence),
    },
  ];
}

function correctionConfidence(evidence: AgpComparisonEvidence) {
  const enoughCorrections =
    evidence.corrections.currentCount >= 5 &&
    evidence.corrections.previousCount >= 5;
  const enoughCoverage =
    evidence.dataQuality.currentCoveragePct >= 70 &&
    evidence.dataQuality.previousCoveragePct >= 70;
  return enoughCorrections && enoughCoverage ? 'medium' : 'low';
}

function correctionSummary(drop: number | null, lowPct: number | null) {
  return [
    drop != null ? `drop ${drop.toFixed(0)} mg/dL` : null,
    lowPct != null ? `low ${lowPct.toFixed(0)}%` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

function correctionSummaryHe(drop: number | null, lowPct: number | null) {
  return [
    drop != null ? `ירידה ${drop.toFixed(0)} מ״ג/ד״ל` : null,
    lowPct != null ? `זמן נמוך ${lowPct.toFixed(0)}%` : null,
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
    return `השתנתה ב־${formatSigned(delta)} ${unit}`;
  }
  return `${delta >= 0 ? 'עלתה' : 'ירדה'} מ־${previous.toFixed(
    0,
  )} ל־${current.toFixed(0)} ${unit}`;
}
