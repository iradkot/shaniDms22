import {
  AgpComparisonEvidence,
  AgpComparisonInsight,
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
        alignedCount
          ? `להתחיל מ־${alignedCount} חלונות שבהם גם התכנית השתנתה וגם ה־AGP השתנה`
          : 'נמצאו שינויי תכנית, אבל אין חלון AGP ברור שמתחבר אליהם ישירות',
        'אם השינוי בתכנית לא יושב על אותו חלון זמן, לבדוק קודם ארוחות, בולוסים או מצב לופ',
        'זו התאמה לבדיקה, לא הוכחת סיבה ולא המלצה לשינוי מינון מתוך המסך',
      ],
      possibleDriversEn: [
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

function formatValue(value: number | null) {
  return value == null ? '-' : Number(value.toFixed(2)).toString();
}
