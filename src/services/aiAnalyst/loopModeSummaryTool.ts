import {fetchProfileChangeHistory} from 'app/services/loopAnalysis/profileHistoryService';
import {computeLoopModeStats, LoopMode} from 'app/containers/MainTabsNavigator/Containers/Trends/hooks/useLoopModeStats';
import {BgSample} from 'app/types/day_bgs.types';

type BasalMode = 'temp' | 'suspended' | 'planned' | 'other';

function inferLoopModeFromBasal(basalMode: BasalMode): LoopMode {
  if (basalMode === 'temp' || basalMode === 'suspended') {
    return 'closed';
  }
  if (basalMode === 'planned') {
    return 'open';
  }
  return 'unknown';
}

function classifyMode(text?: string): LoopMode {
  const s = (text || '').toLowerCase();
  if (!s) {
    return 'unknown';
  }
  if (
    s.includes('open loop') ||
    s.includes('open') ||
    s.includes('manual') ||
    s.includes('profile switch') ||
    s.includes('פתוח') ||
    s.includes('ידני')
  ) {
    return 'open';
  }
  if (
    s.includes('closed loop') ||
    s.includes('closed') ||
    s.includes('auto') ||
    s.includes('aps') ||
    s.includes('openaps') ||
    s.includes('סגור') ||
    s.includes('אוטו')
  ) {
    return 'closed';
  }
  return 'unknown';
}

function classifyBasalMode(text?: string, row?: any): BasalMode {
  const s = (text || '').toLowerCase();
  if (!s) return 'other';

  const rate = Number(row?.rate ?? row?.absolute ?? NaN);
  const duration = Number(row?.duration ?? row?.durationInMinutes ?? NaN);
  const hasBasalSignal =
    s.includes('basal') ||
    s.includes('temp basal') ||
    s.includes('temporary basal') ||
    s.includes('tempbasal') ||
    s.includes('profile switch') ||
    s.includes('profile') ||
    s.includes('suspend') ||
    s.includes('suspended') ||
    s.includes('בסל') ||
    s.includes('פרופיל') ||
    s.includes('זמני') ||
    s.includes('מושהה');

  if (!hasBasalSignal) {
    return 'other';
  }

  if (
    s.includes('suspend') ||
    s.includes('suspended') ||
    s.includes('suspend basal') ||
    s.includes('השע') ||
    s.includes('מושהה') ||
    (Number.isFinite(rate) && rate === 0 && Number.isFinite(duration) && duration > 0)
  ) {
    return 'suspended';
  }

  if (
    s.includes('temp basal') ||
    s.includes('temporary basal') ||
    s.includes('tempbasal') ||
    s.includes('זמני') ||
    s.includes('בסל זמני') ||
    (Number.isFinite(duration) && duration > 0 && !s.includes('profile'))
  ) {
    return 'temp';
  }

  if (
    s.includes('profile') ||
    s.includes('planned basal') ||
    s.includes('plan basal') ||
    s.includes('scheduled basal') ||
    s.includes('programmed basal') ||
    s.includes('בסל מתוכנן') ||
    s.includes('פרופיל')
  ) {
    return 'planned';
  }

  return 'other';
}

export async function buildLoopModeSummary({
  start,
  end,
  bgData,
}: {
  start: Date;
  end: Date;
  bgData: BgSample[];
}) {
  const rows = await fetchProfileChangeHistory({
    startMs: start.getTime() - 24 * 60 * 60 * 1000,
    endMs: end.getTime(),
    limit: 500,
  });

  const events = rows
    .map(r => {
      const eventType = (r as any)?.eventType || '';
      const notes = (r as any)?.notes || '';
      const enteredBy = (r as any)?.enteredBy || '';
      const profile = (r as any)?.profile || '';
      const raw = JSON.stringify(r || {}).slice(0, 400);
      const text = `${eventType} ${notes} ${enteredBy} ${profile} ${r.profileName || ''} ${r.summary || ''} ${raw}`;
      const basalMode = classifyBasalMode(text, r);
      const modeRaw = classifyMode(text);
      const mode = modeRaw === 'unknown' ? inferLoopModeFromBasal(basalMode) : modeRaw;
      return {
        timestamp: r.timestamp,
        mode,
        basalMode,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  const stats = computeLoopModeStats({
    start,
    end,
    bgData,
    events: events.map(e => ({timestamp: e.timestamp, mode: e.mode})),
  });

  const startMs = start.getTime();
  const endMs = end.getTime();
  const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));

  let currentBasalMode: BasalMode = 'other';
  const prior = events.filter(e => e.timestamp <= startMs).slice(-1)[0];
  if (prior) currentBasalMode = prior.basalMode;

  let cursor = startMs;
  let tempBasalMinutes = 0;
  let suspendedMinutes = 0;
  let plannedBasalMinutes = 0;

  for (const e of events) {
    if (e.timestamp <= startMs || e.timestamp >= endMs) {
      if (e.timestamp <= startMs) currentBasalMode = e.basalMode;
      continue;
    }

    const deltaMin = Math.max(0, Math.round((e.timestamp - cursor) / 60000));
    if (currentBasalMode === 'temp') tempBasalMinutes += deltaMin;
    if (currentBasalMode === 'suspended') suspendedMinutes += deltaMin;
    if (currentBasalMode === 'planned') plannedBasalMinutes += deltaMin;

    currentBasalMode = e.basalMode;
    cursor = e.timestamp;
  }

  const tailMin = Math.max(0, Math.round((endMs - cursor) / 60000));
  if (currentBasalMode === 'temp') tempBasalMinutes += tailMin;
  if (currentBasalMode === 'suspended') suspendedMinutes += tailMin;
  if (currentBasalMode === 'planned') plannedBasalMinutes += tailMin;

  return {
    openPct: Number(stats.openPct.toFixed(1)),
    closedPct: Number(stats.closedPct.toFixed(1)),
    openHours: Number((stats.openMinutes / 60).toFixed(1)),
    closedHours: Number((stats.closedMinutes / 60).toFixed(1)),
    openAvgBg: stats.openAvgBg ? Number(stats.openAvgBg.toFixed(0)) : null,
    closedAvgBg: stats.closedAvgBg ? Number(stats.closedAvgBg.toFixed(0)) : null,
    openTirPct: stats.openTirPct ? Number(stats.openTirPct.toFixed(1)) : null,
    closedTirPct: stats.closedTirPct ? Number(stats.closedTirPct.toFixed(1)) : null,

    tempBasalMinutes,
    suspendedMinutes,
    plannedBasalMinutes,
    tempBasalPct: Number(((tempBasalMinutes / totalMinutes) * 100).toFixed(1)),
    suspendedPct: Number(((suspendedMinutes / totalMinutes) * 100).toFixed(1)),
    plannedBasalPct: Number(((plannedBasalMinutes / totalMinutes) * 100).toFixed(1)),

    diagnostics: {
      ...stats.diagnostics,
      basalEvents: events.length,
    },
  };
}
