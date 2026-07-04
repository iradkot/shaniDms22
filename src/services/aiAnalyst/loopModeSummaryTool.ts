import {fetchDeviceStatusForDateRangeUncached} from 'app/api/apiRequests';
import {
  buildLoopModeEventsFromDeviceStatus,
  computeLoopModeStats,
  LOOP_STATUS_CARRY_FORWARD_MINUTES,
} from 'app/containers/MainTabsNavigator/Containers/Trends/hooks/useLoopModeStats';
import {BgSample} from 'app/types/day_bgs.types';

function roundedNumber(value: number | null, digits: number): number | null {
  return value == null ? null : Number(value.toFixed(digits));
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
  const rows = await fetchDeviceStatusForDateRangeUncached(
    new Date(start.getTime() - LOOP_STATUS_CARRY_FORWARD_MINUTES * 60000),
    end,
  );
  const events = buildLoopModeEventsFromDeviceStatus(rows);
  const stats = computeLoopModeStats({
    start,
    end,
    bgData,
    events,
    maxCarryForwardMinutes: LOOP_STATUS_CARRY_FORWARD_MINUTES,
  });

  return {
    openPct: roundedNumber(stats.openPct, 1),
    closedPct: roundedNumber(stats.closedPct, 1),
    unknownPct: roundedNumber(stats.unknownPct, 1),
    knownCoveragePct: roundedNumber(stats.knownCoveragePct, 1),
    hasEnoughLoopCoverage: stats.hasEnoughLoopCoverage,
    canCompareOpenClosed: stats.canCompareOpenClosed,
    openHours: roundedNumber(stats.openMinutes / 60, 1),
    closedHours: roundedNumber(stats.closedMinutes / 60, 1),
    unknownHours: roundedNumber(stats.unknownMinutes / 60, 1),
    openAvgBg: stats.openMetricsReliable
      ? roundedNumber(stats.openAvgBg, 0)
      : null,
    closedAvgBg: stats.closedMetricsReliable
      ? roundedNumber(stats.closedAvgBg, 0)
      : null,
    openTirPct: stats.openMetricsReliable
      ? roundedNumber(stats.openTirPct, 1)
      : null,
    closedTirPct: stats.closedMetricsReliable
      ? roundedNumber(stats.closedTirPct, 1)
      : null,

    tempBasalMinutes: stats.tempBasalMinutes,
    zeroBasalOrStopMinutes: stats.suspendedMinutes,
    suspendedMinutes: stats.suspendedMinutes,
    plannedBasalMinutes: stats.plannedBasalMinutes,
    tempBasalPct: roundedNumber(stats.tempBasalPct, 1),
    zeroBasalOrStopPct: roundedNumber(stats.suspendedPct, 1),
    suspendedPct: roundedNumber(stats.suspendedPct, 1),
    plannedBasalPct: roundedNumber(stats.plannedBasalPct, 1),

    diagnostics: stats.diagnostics,
  };
}
