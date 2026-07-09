import {
  AgpComparisonEvidence,
  AgpComparisonInsight,
  AgpLoopModeComparison,
} from './types';

export function analyzeLoopContext(
  evidence: AgpComparisonEvidence,
): AgpComparisonInsight[] {
  const loopMode = evidence.loopMode;
  if (!loopMode || !hasMeaningfulLoopSignal(loopMode)) {
    return [];
  }

  const closedDelta = loopMode.deltas.closedPct;
  const knownDelta = loopMode.deltas.knownCoveragePct;
  const closedTirDelta = loopMode.deltas.closedTirPct;
  const moreClosed = (closedDelta ?? 0) > 0;

  return [
    {
      id: 'loop-context',
      category: 'loop_context',
      titleHe: `הקשר לופ: ${moreClosed ? 'יותר' : 'פחות'} זמן בלופ סגור`,
      titleEn: `Loop context: ${moreClosed ? 'more' : 'less'} closed-loop time`,
      whatChangedHe: [
        closedDelta != null
          ? `זמן בלופ סגור השתנה ב־${formatSigned(closedDelta)} נקודות`
          : null,
        knownDelta != null
          ? `כיסוי לופ ידוע השתנה ב־${formatSigned(knownDelta)} נקודות`
          : null,
        closedTirDelta != null
          ? `זמן בטווח בזמן לופ סגור השתנה ב־${formatSigned(
              closedTirDelta,
            )} נקודות`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      whatChangedEn: [
        closedDelta != null
          ? `Closed-loop time changed by ${formatSigned(closedDelta)} points`
          : null,
        knownDelta != null
          ? `Known Loop coverage changed by ${formatSigned(knownDelta)} points`
          : null,
        closedTirDelta != null
          ? `Closed-loop TIR changed by ${formatSigned(closedTirDelta)} points`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      possibleDriversHe: [
        'הבדל בתפקוד/כיסוי הלופ בין התקופות',
        'שינוי ב-settings יכול להיראות אחרת כשהלופ סגור יותר או פתוח יותר',
        'אם כיסוי הלופ נמוך, צריך להיזהר מייחוס שינוי ליחסי פחמימות או ISF בלבד',
      ],
      possibleDriversEn: [
        'Different Loop operation or coverage between periods',
        'Settings changes may look different when Loop is closed more or less often',
        'When Loop coverage is limited, avoid attributing the change only to carb ratio or ISF',
      ],
      evidenceHe: [
        `נוכחי: לופ סגור ${formatPct(
          loopMode.current.closedPct,
        )}, לופ פתוח ${formatPct(
          loopMode.current.openPct,
        )}, כיסוי ידוע ${formatPct(loopMode.current.knownCoveragePct)}`,
        `קודם: לופ סגור ${formatPct(
          loopMode.previous.closedPct,
        )}, לופ פתוח ${formatPct(
          loopMode.previous.openPct,
        )}, כיסוי ידוע ${formatPct(loopMode.previous.knownCoveragePct)}`,
      ],
      evidenceEn: [
        `Current: closed ${formatPct(
          loopMode.current.closedPct,
        )}, open ${formatPct(loopMode.current.openPct)}, known ${formatPct(
          loopMode.current.knownCoveragePct,
        )}`,
        `Previous: closed ${formatPct(
          loopMode.previous.closedPct,
        )}, open ${formatPct(loopMode.previous.openPct)}, known ${formatPct(
          loopMode.previous.knownCoveragePct,
        )}`,
      ],
      confidence:
        loopMode.current.hasEnoughLoopCoverage &&
        loopMode.previous.hasEnoughLoopCoverage
          ? 'medium'
          : 'low',
    },
  ];
}

function hasMeaningfulLoopSignal(loopMode: AgpLoopModeComparison) {
  return (
    Math.abs(loopMode.deltas.closedPct ?? 0) >= 12 ||
    Math.abs(loopMode.deltas.openPct ?? 0) >= 12 ||
    Math.abs(loopMode.deltas.knownCoveragePct ?? 0) >= 15 ||
    Math.abs(loopMode.deltas.closedTirPct ?? 0) >= 8 ||
    Math.abs(loopMode.deltas.openTirPct ?? 0) >= 8
  );
}

function formatSigned(value: number) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? '+' : ''}${rounded}`;
}

function formatPct(value: number | null) {
  return value == null ? '-' : `${value.toFixed(0)}%`;
}
