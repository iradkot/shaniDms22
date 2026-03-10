import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, View} from 'react-native';
import {subDays} from 'date-fns';
import {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useNavigation} from '@react-navigation/native';

import {
  fetchBgDataForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {getLatestDailyBrief, regenerateDailyBrief} from 'app/services/proactiveCare/dailyBrief';
import {computeRank} from 'app/services/proactiveCare/streakRank';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {RANKS_INFO_SCREEN} from 'app/constants/SCREEN_NAMES';
import {
  extractBasalProfileFromNightscoutProfileData,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';
import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';

type Row = {sgv: number; dateString?: string};

function metricRows(rows: Row[], ranges: {hypo: number; severeHypo: number; hyper: number}) {
  if (!rows.length) return {avg: 0, tir: 0, lows: 0, severeLows: 0, highs: 0};
  const avg = Math.round(rows.reduce((s, r) => s + r.sgv, 0) / rows.length);
  const severeLows = rows.filter(r => r.sgv <= ranges.severeHypo).length;
  const lows = rows.filter(r => r.sgv > ranges.severeHypo && r.sgv < ranges.hypo).length;
  const highs = rows.filter(r => r.sgv > ranges.hyper).length;
  const tir = Math.round((rows.filter(r => r.sgv >= ranges.hypo && r.sgv <= ranges.hyper).length / rows.length) * 100);
  return {avg, tir, lows, severeLows, highs};
}

function tierVisual(tier: string) {
  switch (tier) {
    case 'Diamond': return {emoji: '💎', color: '#4fc3f7'};
    case 'Platinum': return {emoji: '🛡️', color: '#81d4fa'};
    case 'Gold': return {emoji: '🏆', color: '#fbc02d'};
    case 'Silver': return {emoji: '🥈', color: '#b0bec5'};
    default: return {emoji: '🥉', color: '#b87333'};
  }
}

const DailyReviewScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation<any>();
  const {settings: aiSettings} = useAiSettings();
  const {settings: glucoseSettings} = useGlucoseSettings();

  const [loading, setLoading] = useState(true);
  const [refreshingAction, setRefreshingAction] = useState(false);
  const [yRows, setYRows] = useState<Row[]>([]);
  const [wRows, setWRows] = useState<Row[]>([]);
  const [insulin, setInsulin] = useState({yesterday: 0, prevDay: 0, avgDaily7: 0});
  const [llmActionLine, setLlmActionLine] = useState<string | null>(null);
  const [whyLine, setWhyLine] = useState<string | null>(null);
  const [actionSource, setActionSource] = useState<'ai' | 'fallback'>('fallback');

  const todayStart = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
  }, []);
  const yStart = useMemo(() => subDays(todayStart, 1), [todayStart]);
  const prevDayStart = useMemo(() => subDays(yStart, 1), [yStart]);
  const wStart = useMemo(() => subDays(todayStart, 8), [todayStart]);

  const ranges = useMemo(
    () => ({
      severeHypo: glucoseSettings.severeHypo ?? 55,
      hypo: glucoseSettings.hypo ?? 70,
      hyper: glucoseSettings.hyper ?? 180,
    }),
    [glucoseSettings.severeHypo, glucoseSettings.hypo, glucoseSettings.hyper],
  );

  const getDayInsulinTotal = async (dayStart: Date): Promise<number> => {
    const s = new Date(dayStart); s.setHours(0, 0, 0, 0);
    const e = new Date(dayStart); e.setHours(23, 59, 59, 999);

    const [treatments, profileData] = await Promise.all([
      fetchTreatmentsForDateRangeUncached(s, e),
      getUserProfileFromNightscout(s.toISOString()),
    ]);

    const entries = mapNightscoutTreatmentsToInsulinDataEntries(treatments ?? []);
    const basal = extractBasalProfileFromNightscoutProfileData(profileData);
    const totals = calculateTotalInsulin(entries, basal, s, e);
    return (totals.totalBasal || 0) + (totals.totalBolus || 0);
  };

  const loadData = async () => {
    const [y, w, latestBrief] = await Promise.all([
      fetchBgDataForDateRangeUncached(yStart, todayStart, {throwOnError: false}),
      fetchBgDataForDateRangeUncached(wStart, yStart, {throwOnError: false}),
      getLatestDailyBrief(),
    ]);
    setYRows((y as any) ?? []);
    setWRows((w as any) ?? []);

    try {
      const yesterdayTotal = await getDayInsulinTotal(yStart);
      const prevDayTotal = await getDayInsulinTotal(prevDayStart);
      let weekSum = 0;
      for (let i = 1; i <= 7; i++) weekSum += await getDayInsulinTotal(subDays(todayStart, i));
      setInsulin({yesterday: yesterdayTotal, prevDay: prevDayTotal, avgDaily7: weekSum / 7});
    } catch {
      setInsulin({yesterday: 0, prevDay: 0, avgDaily7: 0});
    }

    if (latestBrief?.body) {
      const lines = latestBrief.body.split('\n').map(s => s.trim()).filter(Boolean);
      setLlmActionLine(lines.find(l => l.startsWith('🎯')) || lines[2] || null);
      setWhyLine(lines.find(l => l.startsWith('🧠')) || null);
      setActionSource(latestBrief.source === 'ai' ? 'ai' : 'fallback');
    } else {
      setLlmActionLine(null);
      setWhyLine(null);
      setActionSource('fallback');
    }
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadData().finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const handleRegenerate = async () => {
    try {
      setRefreshingAction(true);
      await regenerateDailyBrief({
        glucose: glucoseSettings,
        ai: {enabled: aiSettings.enabled, apiKey: aiSettings.apiKey, model: aiSettings.openAiModel},
        notify: false,
      });
      await loadData();
    } finally {
      setRefreshingAction(false);
    }
  };

  const y = useMemo(() => metricRows(yRows, ranges), [yRows, ranges]);
  const w = useMemo(() => metricRows(wRows, ranges), [wRows, ranges]);

  const rank = useMemo(
    () => computeRank({tir: w.tir || y.tir, lows: w.lows + w.severeLows, highs: w.highs}),
    [w.tir, w.lows, w.severeLows, w.highs, y.tir],
  );
  const rv = tierVisual(rank.tier);

  const action = llmActionLine || 'Today: keep stable routine and avoid stacking';
  const insulinDelta = insulin.yesterday - insulin.prevDay;
  const tirDelta = y.tir - w.tir;

  const card = {backgroundColor: theme.white, borderRadius: 14, padding: 12};

  if (loading) {
    return <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}><ActivityIndicator /></View>;
  }

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 10}}>
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
        <Pressable onPress={() => navigation.goBack()} style={{padding: 4}}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textColor} />
        </Pressable>
        <Text style={{fontSize: 24, fontWeight: '800', color: theme.textColor}}>Daily Review</Text>
        <View style={{width: 24}} />
      </View>

      <Pressable onPress={() => navigation.navigate(RANKS_INFO_SCREEN)} style={{...card, backgroundColor: addOpacity(rv.color, 0.14), borderWidth: 1, borderColor: addOpacity(rv.color, 0.6)}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{rv.emoji} {rank.tier}</Text>
          <Text style={{fontWeight: '700', color: addOpacity(theme.textColor, 0.7)}}>Score {rank.score}</Text>
        </View>
        <View style={{height: 8, borderRadius: 10, backgroundColor: addOpacity(theme.textColor, 0.12), marginTop: 8}}>
          <View style={{height: 8, borderRadius: 10, width: `${Math.max(5, rank.progressToNextPct)}%`, backgroundColor: rv.color}} />
        </View>
      </Pressable>

      <View style={{flexDirection: 'row', gap: 8}}>
        <View style={{...card, flex: 1}}>
          <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.65)}}>TIR</Text>
          <Text style={{fontSize: 22, fontWeight: '800', color: theme.textColor}}>{y.tir}%</Text>
          <Text style={{fontSize: 12, color: tirDelta >= 0 ? '#2e7d32' : '#c62828'}}>{tirDelta >= 0 ? '+' : ''}{tirDelta} vs 7d</Text>
        </View>
        <View style={{...card, flex: 1}}>
          <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.65)}}>Avg BG</Text>
          <Text style={{fontSize: 22, fontWeight: '800', color: theme.textColor}}>{y.avg}</Text>
          <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.65)}}>7d {w.avg}</Text>
        </View>
      </View>

      <View style={{...card}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Insulin</Text>
        <Text style={{marginTop: 4, color: theme.textColor}}>Yesterday {insulin.yesterday.toFixed(1)}U ({insulinDelta >= 0 ? '+' : ''}{insulinDelta.toFixed(1)} vs day before)</Text>
        <Text style={{marginTop: 2, color: addOpacity(theme.textColor, 0.75)}}>7d avg {insulin.avgDaily7.toFixed(1)}U/day</Text>
      </View>

      <View style={{...card}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Glucose events</Text>
        <Text style={{marginTop: 4, color: theme.textColor}}>Hypo {y.lows} • Severe {y.severeLows} • Highs {y.highs}</Text>
      </View>

      <Pressable onPress={handleRegenerate} disabled={refreshingAction} style={{...card, alignItems: 'center'}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>{refreshingAction ? 'Regenerating…' : 'Regenerate recommendation'}</Text>
      </Pressable>

      <View style={{...card}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <Text style={{fontWeight: '700', color: theme.textColor}}>Today</Text>
          <Text style={{fontSize: 12, color: addOpacity(theme.textColor, 0.65)}}>{actionSource === 'ai' ? 'AI' : 'Fallback'}</Text>
        </View>
        <Text style={{marginTop: 4, color: theme.textColor}}>{action}</Text>
        {whyLine ? <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.75)}}>{whyLine}</Text> : null}
      </View>
    </ScrollView>
  );
};

export default DailyReviewScreen;
