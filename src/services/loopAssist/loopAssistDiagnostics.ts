export type LoopAssistContextPayload = {
  stressOrSick: 'yes' | 'no' | null;
  specialExercise: 'yes' | 'no' | null;
  pumpSetOk: 'yes' | 'no' | null;
  stressDetails: string;
  exerciseDetails: string;
  pumpDetails: string;
  generalDetails: string;
};

const toTs = (v: any): number | null => {
  const n = typeof v === 'number' ? v : Date.parse(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

const readIob = (d: any): number | null => {
  const candidates = [d?.loop?.iob?.iob, d?.openaps?.iob?.iob, d?.iob];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
};

const readCob = (d: any): number | null => {
  const candidates = [d?.loop?.cob?.cob, d?.openaps?.cob?.cob, d?.openaps?.meal?.cob, d?.cob];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
};

const readAutosensRatio = (d: any): number | null => {
  const candidates = [
    d?.openaps?.autosens?.ratio,
    d?.openaps?.suggested?.sensitivityRatio,
    d?.loop?.autosens?.ratio,
    d?.sensitivityRatio,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return null;
};

const estimateZeroTempBasalMinutes = (d: any): number => {
  const tb = d?.openaps?.suggested || d?.loop?.suggested || d?.suggested || {};
  const rate = Number(tb?.rate ?? tb?.temp ?? NaN);
  const duration = Number(tb?.duration ?? tb?.durationMinutes ?? NaN);
  if (Number.isFinite(rate) && Number.isFinite(duration) && rate <= 0) {
    return Math.max(0, Math.round(duration));
  }
  return 0;
};

const toMinutes = (time: string | undefined): number => {
  if (!time) return 0;
  const [h, m] = String(time).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
};

const valueAtMinutes = (arr: any[] | undefined, minutes: number): number | null => {
  if (!Array.isArray(arr) || !arr.length) return null;
  const sorted = [...arr]
    .map((x: any) => ({timeAsSeconds: Number(x?.timeAsSeconds ?? toMinutes(String(x?.time ?? '00:00')) * 60), value: Number(x?.value ?? NaN)}))
    .filter((x: any) => Number.isFinite(x.timeAsSeconds) && Number.isFinite(x.value))
    .sort((a: any, b: any) => a.timeAsSeconds - b.timeAsSeconds);
  if (!sorted.length) return null;

  const targetSec = minutes * 60;
  let chosen = sorted[0];
  for (const item of sorted) {
    if (item.timeAsSeconds <= targetSec) {
      chosen = item;
    } else {
      break;
    }
  }
  return chosen?.value ?? null;
};

const extractLoopSettingsProfile = (profileRaw: any) => {
  const p0 = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
  const defaultProfileName = String(p0?.defaultProfile ?? '');
  const store = p0?.store?.[defaultProfileName] ?? null;
  if (!store) {
    return {
      available: false,
      reason: 'store/defaultProfile missing',
    };
  }

  const eveningMinutes = 22 * 60;
  const predawnMinutes = 4 * 60;

  const eveningCarbRatio = valueAtMinutes(store?.carbratio, eveningMinutes);
  const predawnISF = valueAtMinutes(store?.sens, predawnMinutes);
  const eveningTargetLow = valueAtMinutes(store?.target_low, eveningMinutes);
  const eveningTargetHigh = valueAtMinutes(store?.target_high, eveningMinutes);
  const predawnTargetLow = valueAtMinutes(store?.target_low, predawnMinutes);
  const predawnTargetHigh = valueAtMinutes(store?.target_high, predawnMinutes);
  const predawnBasal = valueAtMinutes(store?.basal, predawnMinutes);

  return {
    available: true,
    defaultProfile: defaultProfileName,
    units: String(store?.units ?? p0?.units ?? 'mg/dL'),
    diaHours: Number(store?.dia ?? NaN),
    around22_00: {
      carbRatio: eveningCarbRatio,
      targetLow: eveningTargetLow,
      targetHigh: eveningTargetHigh,
    },
    around04_00: {
      isf: predawnISF,
      basal: predawnBasal,
      targetLow: predawnTargetLow,
      targetHigh: predawnTargetHigh,
    },
    rawSeries: {
      carbratio: Array.isArray(store?.carbratio) ? store.carbratio : [],
      sens: Array.isArray(store?.sens) ? store.sens : [],
      target_low: Array.isArray(store?.target_low) ? store.target_low : [],
      target_high: Array.isArray(store?.target_high) ? store.target_high : [],
      basal: Array.isArray(store?.basal) ? store.basal : [],
    },
  };
};

export function buildLoopAssistAiContext(params: {
  language: string;
  trend: any;
  clinicalQa: LoopAssistContextPayload;
  bgRows: any[];
  treatments: any[];
  deviceStatusRows: any[];
  profile: any;
}) {
  const {language, trend, clinicalQa, bgRows, treatments, deviceStatusRows, profile} = params;

  const bgList = (bgRows ?? []) as any[];
  const txList = (treatments ?? []) as any[];
  const dsList = (deviceStatusRows ?? []) as any[];
  const loopSettingsProfile = extractLoopSettingsProfile(profile);

  const avgBg = bgList.length
    ? Math.round(bgList.reduce((s, r) => s + Number(r?.sgv ?? 0), 0) / bgList.length)
    : null;

  const tirPct = bgList.length
    ? Math.round(
        (bgList.filter(r => Number(r?.sgv ?? 0) >= 70 && Number(r?.sgv ?? 0) <= 180).length /
          bgList.length) *
          100,
      )
    : null;

  const correctionCount = txList.filter(t => String(t?.eventType ?? '').toLowerCase().includes('correction')).length;

  const bgSeries = bgList
    .map(r => ({ts: toTs(r?.date ?? r?.dateString), sgv: Number(r?.sgv ?? NaN)}))
    .filter(r => Number.isFinite(r.ts) && Number.isFinite(r.sgv)) as Array<{ts: number; sgv: number}>;

  const lows = bgSeries.filter(r => r.sgv < 70);
  const overnightEarlyLows = lows.filter(r => {
    const h = new Date(r.ts).getHours();
    return h >= 22 || h < 1;
  });
  const predawnLows = lows.filter(r => {
    const h = new Date(r.ts).getHours();
    return h >= 3 && h < 6;
  });

  const dsSeries = dsList
    .map(d => ({
      ts: toTs(d?.mills ?? d?.created_at),
      iob: readIob(d),
      cob: readCob(d),
      autosensRatio: readAutosensRatio(d),
      zeroTempBasalMinutes: estimateZeroTempBasalMinutes(d),
    }))
    .filter(d => Number.isFinite(d.ts)) as Array<{
      ts: number;
      iob: number | null;
      cob: number | null;
      autosensRatio: number | null;
      zeroTempBasalMinutes: number;
    }>;

  const iobAroundEarlyLows = overnightEarlyLows
    .map(low => {
      const near = dsSeries
        .filter(d => Math.abs(Number(d.ts) - low.ts) <= 25 * 60 * 1000)
        .sort((a, b) => Math.abs(Number(a.ts) - low.ts) - Math.abs(Number(b.ts) - low.ts))[0];
      return near?.iob ?? null;
    })
    .filter((n): n is number => Number.isFinite(n));

  const iobAroundPredawnLows = predawnLows
    .map(low => {
      const near = dsSeries
        .filter(d => Math.abs(Number(d.ts) - low.ts) <= 25 * 60 * 1000)
        .sort((a, b) => Math.abs(Number(a.ts) - low.ts) - Math.abs(Number(b.ts) - low.ts))[0];
      return near?.iob ?? null;
    })
    .filter((n): n is number => Number.isFinite(n));

  const avgIobEarlyLow = iobAroundEarlyLows.length
    ? Number((iobAroundEarlyLows.reduce((s, n) => s + n, 0) / iobAroundEarlyLows.length).toFixed(2))
    : null;
  const avgIobPredawnLow = iobAroundPredawnLows.length
    ? Number((iobAroundPredawnLows.reduce((s, n) => s + n, 0) / iobAroundPredawnLows.length).toFixed(2))
    : null;

  const autosensValues = dsSeries
    .map(d => d.autosensRatio)
    .filter((n): n is number => Number.isFinite(n));
  const autosensAvg = autosensValues.length
    ? Number((autosensValues.reduce((s, n) => s + n, 0) / autosensValues.length).toFixed(2))
    : null;
  const autosensSensitivePct = autosensAvg != null ? Math.round(autosensAvg * 100) : null;

  const zeroTempBeforeLows = lows.map(low => {
    const before = dsSeries
      .filter(d => Number(d.ts) <= low.ts && Number(d.ts) >= low.ts - 2 * 60 * 60 * 1000)
      .sort((a, b) => Number(b.ts) - Number(a.ts))[0];
    return before?.zeroTempBasalMinutes ?? 0;
  });
  const maxZeroTempBeforeLowMin = zeroTempBeforeLows.length ? Math.max(...zeroTempBeforeLows) : 0;

  let compressionLowSuspicionCount = 0;
  for (const low of lows) {
    const pre = bgSeries.find(r => r.ts <= low.ts - 15 * 60 * 1000 && r.ts >= low.ts - 25 * 60 * 1000);
    const post = bgSeries.find(r => r.ts >= low.ts + 15 * 60 * 1000 && r.ts <= low.ts + 35 * 60 * 1000);
    if (!pre || !post) {
      continue;
    }

    const drop = pre.sgv - low.sgv;
    const recovery = post.sgv - low.sgv;
    if (drop >= 50 && recovery >= 35) {
      const carbsNear = txList.some(t => {
        const ts = toTs(t?.created_at);
        if (!Number.isFinite(ts)) {
          return false;
        }
        return ts >= low.ts - 10 * 60 * 1000 && ts <= low.ts + 45 * 60 * 1000 && Number(t?.carbs ?? 0) > 0;
      });
      if (!carbsNear) {
        compressionLowSuspicionCount += 1;
      }
    }
  }

  return {
    contextForAi: {
      language,
      trend,
      clinicalQa,
      dataSummary: {
        windowDays: 7,
        bgCount: bgList.length,
        treatmentsCount: txList.length,
        deviceStatusCount: dsList.length,
        avgBg,
        tirPct,
        correctionCount,
      },
      loopDiagnostics: {
        overnightEarlyLowsCount: overnightEarlyLows.length,
        predawnLowsCount: predawnLows.length,
        avgIobEarlyLow,
        avgIobPredawnLow,
        autosensAvg,
        autosensSensitivePct,
        maxZeroTempBeforeLowMin,
        compressionLowSuspicionCount,
        interpretationHints: {
          earlyLowWithHighIobLikely:
            'evening CR too aggressive or late bolus overlap, not necessarily night target',
          predawnLowWithNearZeroIobLikely: 'basal/target issue more likely',
          autosensHighLikely: 'temporary increased sensitivity',
          compressionLowLikely: 'possible pressure low - avoid settings changes',
        },
      },
      loopSettingsProfile,
      profileAvailability: {
        hasRawProfile: Boolean(profile),
        extractedAvailable: Boolean((loopSettingsProfile as any)?.available),
      },
      samples: {
        bgFirst80: bgList.slice(0, 80),
        treatmentsFirst80: txList.slice(0, 80),
        deviceStatusFirst80: dsList.slice(0, 80),
      },
      profile,
    },
    derived: {
      avgBg,
      tirPct,
      correctionCount,
      compressionLowSuspicionCount,
    },
  };
}
