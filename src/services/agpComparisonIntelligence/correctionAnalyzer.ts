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
          ? `ירידה אחרי 3 שעות השתנתה ב-${formatSigned(dropDelta)} mg/dL`
          : null,
        lowDelta != null
          ? `low אחרי תיקון השתנה ב-${formatSigned(lowDelta)} נקודות`
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
        ? ['ISF חזק מדי', 'תיקון מוקדם מדי לפני סיום פעילות אינסולין קודמת']
        : ['ISF חלש מדי', 'תיקון מאוחר מדי או לופ שמפצה לאט'],
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
        `נוכחי: ${corrections.currentCount} תיקונים, ${currentStr}`,
        `קודם: ${corrections.previousCount} תיקונים, ${previousStr}`,
      ],
      evidenceEn: [
        `Current: ${corrections.currentCount} corrections, ${currentStr}`,
        `Previous: ${corrections.previousCount} corrections, ${previousStr}`,
      ],
      confidence:
        corrections.currentCount >= 5 && corrections.previousCount >= 5
          ? 'medium'
          : 'low',
    },
  ];
}

function correctionSummary(drop: number | null, lowPct: number | null) {
  return [
    drop != null ? `drop ${drop.toFixed(0)} mg/dL` : null,
    lowPct != null ? `low ${lowPct.toFixed(0)}%` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

function formatSigned(value: number) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? '+' : ''}${rounded}`;
}
