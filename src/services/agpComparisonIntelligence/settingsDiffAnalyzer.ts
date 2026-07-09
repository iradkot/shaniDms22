import {
  AgpComparisonEvidence,
  AgpComparisonInsight,
  AgpSettingsValueDiff,
} from './types';

export function analyzeSettingsDiffs(
  evidence: AgpComparisonEvidence,
): AgpComparisonInsight[] {
  const diffs = evidence.settingsDiffs.filter(isImportantSettingDiff);
  if (!diffs.length) {
    return [];
  }

  return [
    {
      id: 'settings-diff',
      category: 'settings',
      titleHe: 'הבדלים בתכנית שיכולים להסביר חלק מהשינוי',
      titleEn: 'Plan differences that may explain part of the change',
      whatChangedHe: diffs.slice(0, 4).map(formatDiffHe).join(' · '),
      whatChangedEn: diffs.slice(0, 4).map(formatDiffEn).join(' · '),
      possibleDriversHe: [
        'אם שינוי AGP מופיע באותו חלון זמן, זה מועמד טוב להסבר',
        'אם אין התאמה בזמן, כנראה שהגורם הוא התנהגות/ארוחות/לופ ולא ההגדרה הזו',
      ],
      possibleDriversEn: [
        'If the AGP shift appears in the same window, this is a plausible driver',
        'If timing does not line up, behavior/meals/Loop context are more likely',
      ],
      evidenceHe: [`נמצאו ${diffs.length} הבדלי settings בין התקופות`],
      evidenceEn: [
        `Found ${diffs.length} settings differences between periods`,
      ],
      confidence: 'medium',
    },
  ];
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
  return `${diff.labelHe}: ${formatValue(diff.previous)} -> ${formatValue(
    diff.current,
  )}`;
}

function formatDiffEn(diff: AgpSettingsValueDiff) {
  return `${diff.labelEn}: ${formatValue(diff.previous)} -> ${formatValue(
    diff.current,
  )}`;
}

function formatValue(value: number | null) {
  return value == null ? '-' : Number(value.toFixed(2)).toString();
}
