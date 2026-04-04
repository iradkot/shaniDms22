import {fetchProfileChangeHistory} from 'app/services/loopAnalysis/profileHistoryService';
import {computeLoopModeStats, LoopMode} from 'app/containers/MainTabsNavigator/Containers/Trends/hooks/useLoopModeStats';
import {BgSample} from 'app/types/day_bgs.types';

function classifyMode(text?: string): LoopMode {
  const s = (text || '').toLowerCase();
  if (!s) {
    return 'unknown';
  }
  if (s.includes('open') || s.includes('manual') || s.includes('פתוח') || s.includes('ידני')) {
    return 'open';
  }
  if (s.includes('closed') || s.includes('auto') || s.includes('aps') || s.includes('סגור') || s.includes('אוטו')) {
    return 'closed';
  }
  return 'unknown';
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
    .map(r => ({timestamp: r.timestamp, mode: classifyMode(`${r.profileName || ''} ${r.summary || ''}`)}))
    .sort((a, b) => a.timestamp - b.timestamp);

  const stats = computeLoopModeStats({start, end, bgData, events});

  return {
    openPct: Number(stats.openPct.toFixed(1)),
    closedPct: Number(stats.closedPct.toFixed(1)),
    openHours: Number((stats.openMinutes / 60).toFixed(1)),
    closedHours: Number((stats.closedMinutes / 60).toFixed(1)),
    openAvgBg: stats.openAvgBg ? Number(stats.openAvgBg.toFixed(0)) : null,
    closedAvgBg: stats.closedAvgBg ? Number(stats.closedAvgBg.toFixed(0)) : null,
    openTirPct: stats.openTirPct ? Number(stats.openTirPct.toFixed(1)) : null,
    closedTirPct: stats.closedTirPct ? Number(stats.closedTirPct.toFixed(1)) : null,
    diagnostics: stats.diagnostics,
  };
}
