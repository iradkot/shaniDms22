import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';

export function formatIobSplitLabel(params: {
  totalU: number | null;
  bolusU?: number | null;
  basalU?: number | null;
  digits?: number;
  formatTotal?: (u: number) => string;
  formatBolus?: (u: number) => string;
  formatBasal?: (u: number) => string;
}): string {
  const {
    totalU,
    bolusU,
    basalU,
    digits = 2,
    formatTotal,
    formatBolus,
    formatBasal,
  } = params;

  if (totalU == null || !Number.isFinite(totalU)) return '—';

  const totalText = formatTotal ? formatTotal(totalU) : `${totalU.toFixed(digits)} U`;

  const hasSplit =
    (bolusU != null && Number.isFinite(bolusU)) || (basalU != null && Number.isFinite(basalU));
  if (!hasSplit) return totalText;

  const bolus = bolusU != null && Number.isFinite(bolusU) ? bolusU : 0;
  const basal = basalU != null && Number.isFinite(basalU) ? basalU : 0;

  const bolusText = formatBolus ? formatBolus(bolus) : `${bolus.toFixed(digits)} bolus`;
  const basalText = formatBasal ? formatBasal(basal) : `${basal.toFixed(digits)} basal`;

  return `${totalText} (${bolusText}, ${basalText})`;
}

export function formatBolusCloseEventsDetails(events: Array<{timestamp: string; amount?: number | null}>):
  | string
  | null {
  if (!events?.length) return null;

  const parts = events
    .map(e => {
      const t = new Date(e.timestamp).getTime();
      const time = Number.isFinite(t) ? formatDateToLocaleTimeString(t) : null;
      if (!time) return null;

      const dose = e.amount;
      if (typeof dose === 'number' && Number.isFinite(dose)) {
        return `${time} (${dose.toFixed(2)}U)`;
      }
      return time;
    })
    .filter(Boolean) as string[];

  return parts.length ? parts.join(', ') : null;
}

export function formatCarbCloseEventsDetails(events: Array<{timestamp: number; carbs?: number | null}>):
  | string
  | null {
  if (!events?.length) return null;

  const parts = events
    .map(e => {
      const time = formatDateToLocaleTimeString(e.timestamp);
      const g = e.carbs;
      if (typeof g === 'number' && Number.isFinite(g)) {
        return `${time} (${Math.round(g)}g)`;
      }
      return time;
    })
    .filter(Boolean) as string[];

  return parts.length ? parts.join(', ') : null;
}
