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
import {computeInsulinStats} from './components/InsulinStatsRow/InsulinDataCalculations';
import {
  extractBasalProfileFromNightscoutProfileData,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';

type Row = {sgv: number; dateString?: string};

function metrics(rows: Row[]) {
  if (!rows.length) return {avg: 0, tir: 0, lows: 0, severeLows: 0, highs: 0};
  const avg = Math.round(rows.reduce((s, r) => s + r.sgv, 0) / rows.length);
  const severeLows = rows.filter(r => r.sgv <= 55).length;
  const lows = rows.filter(r => r.sgv > 55 && r.sgv < 70).length;
  const highs = rows.filter(r => r.sgv > 180).length;
  const tir = Math.round((rows.filter(r => r.sgv >= 70 && r.sgv <= 180).length / rows.length) * 100);
  return {avg, tir, lows, severeLows, highs};
}

function tierVisual(tier: string) {
  switch (tier) {
    case 'Diamond':
      return {emoji: '💎', color: '#4fc3f7'};
    case 'Platinum':
      return {emoji: '🛡️', color: '#81d4fa'};
    case 'Gold':
      return {emoji: '🏆', color: '#fbc02d'};
    case 'Silver':
      return {emoji: '🥈', color: '#b0bec5'};
    default:
      return {emoji: '🥉', color: '#b87333'};
  }
}

const cardStyle = (theme: ThemeType) => ({
  backgroundColor: theme.white,
  borderRadius: 14,
  padding: 12,
  borderWidth: 1,
  borderColor: addOpacity(theme.textColor, 0.1),
});

const DailyReviewScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const navigation = useNavigation<any>();
  const {settings: aiSettings} = useAiSettings();
  const {settings: glucoseSettings} = useGlucoseSettings();

  const [loading, setLoading] = useState(true);
  const [refreshingAction, setRefreshingAction] = useState(false);
  const [yesterdayRows, setYesterdayRows] = useState<Row[]>([]);
  const [weekRows, setWeekRows] = useState<Row[]>([]);
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

  const loadData = async () => {
    const [y, w, latestBrief, treatments, profileData] = await Promise.all([
      fetchBgDataForDateRangeUncached(yStart, todayStart, {throwOnError: false}),
      fetchBgDataForDateRangeUncached(wStart, yStart, {throwOnError: false}),
      getLatestDailyBrief(),
      fetchTreatmentsForDateRangeUncached(wStart, todayStart),
      getUserProfileFromNightscout(todayStart.toISOString()),
    ]);

    setYesterdayRows((y as any) ?? []);
    setWeekRows((w as any) ?? []);

    try {
      const entries = mapNightscoutTreatmentsToInsulinDataEntries(treatments ?? []);
      const basal = extractBasalProfileFromNightscoutProfileData(profileData);

      const yIns = computeInsulinStats(entries, basal, yStart, todayStart).totalInsulin;
      const prevIns = computeInsulinStats(entries, basal, prevDayStart, yStart).totalInsulin;
      const weekIns = computeInsulinStats(entries, basal, wStart, yStart).totalInsulin;

      setInsulin({
        yesterday: yIns,
        prevDay: prevIns,
        avgDaily7: weekIns > 0 ? weekIns / 7 : 0,
      });
    } catch {
      setInsulin({yesterday: 0, prevDay: 0, avgDaily7: 0});
    }

    if (latestBrief?.body) {
      const lines = latestBrief.body.split('\n').map(s => s.trim()).filter(Boolean);
      const action = lines.find(l => l.startsWith('🎯')) || lines[2] || null;
      const why = lines.find(l => l.startsWith('🧠')) || null;
      setLlmActionLine(action);
      setWhyLine(why);
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
    loadData()
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleRegenerate = async () => {
    try {
      setRefreshingAction(true);
      await regenerateDailyBrief({
        glucose: glucoseSettings,
        ai: {
          enabled: aiSettings.enabled,
          apiKey: aiSettings.apiKey,
          model: aiSettings.openAiModel,
        },
        notify: false,
      });
      await loadData();
    } finally {
      setRefreshingAction(false);
    }
  };

  const y = useMemo(() => metrics(yesterdayRows), [yesterdayRows]);
  const w = useMemo(() => metrics(weekRows), [weekRows]);

  const tirDelta = y.tir - w.tir;
  const lowDelta = y.lows - w.lows;
  const severeLowDelta = y.severeLows - w.severeLows;
  const insulinDelta = insulin.yesterday - insulin.prevDay;

  const heuristicAction = y.lows > 0 ? 'Action today: reduce stacking risk in afternoon' : 'Action today: keep current pattern';
  const action = llmActionLine || heuristicAction;

  const rank = useMemo(
    () => computeRank({tir: w.tir || y.tir, lows: w.lows + w.severeLows, highs: w.highs}),
    [w.tir, w.lows, w.severeLows, w.highs, y.tir],
  );
  const rv = tierVisual(rank.tier);

  if (loading) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 10}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
        <Pressable onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color={theme.textColor} />
        </Pressable>
        <Text style={{fontSize: 24, fontWeight: '800', color: theme.textColor}}>Daily Review</Text>
      </View>

      <Pressable
        onPress={() => navigation.navigate(RANKS_INFO_SCREEN)}
        style={{...cardStyle(theme), backgroundColor: addOpacity(rv.color, 0.14), borderColor: addOpacity(rv.color, 0.6)}}
      >
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{rv.emoji} Ranked Streak</Text>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{rank.tier}</Text>
        </View>
        <View style={{height: 8, borderRadius: 10, backgroundColor: addOpacity(theme.textColor, 0.12), marginTop: 8}}>
          <View style={{height: 8, borderRadius: 10, width: `${Math.max(4, rank.progressToNextPct)}%`, backgroundColor: rv.color}} />
        </View>
        <Text style={{color: addOpacity(theme.textColor, 0.8), marginTop: 6}}>
          {rank.nextTier ? `Progress to ${rank.nextTier}: ${rank.progressToNextPct}%` : 'Max tier reached'}
        </Text>
      </Pressable>

      <Pressable onPress={handleRegenerate} disabled={refreshingAction} style={{...cardStyle(theme), alignItems: 'center'}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>
          {refreshingAction ? 'Regenerating…' : 'Regenerate recommendation'}
        </Text>
      </Pressable>

      <View style={cardStyle(theme)}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Yesterday</Text>
        <Text style={{color: theme.textColor}}>TIR {y.tir}% • Avg {y.avg} • Hypo {y.lows} • Severe {y.severeLows}</Text>
        <Text style={{color: addOpacity(theme.textColor, 0.8), marginTop: 4}}>
          Insulin {insulin.yesterday.toFixed(1)}U ({insulinDelta >= 0 ? '+' : ''}{insulinDelta.toFixed(1)} vs day before)
        </Text>
      </View>

      <View style={cardStyle(theme)}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>7-day baseline</Text>
        <Text style={{color: theme.textColor}}>TIR {w.tir}% • Avg {w.avg} • Hypo {w.lows} • Severe {w.severeLows}</Text>
        <Text style={{color: addOpacity(theme.textColor, 0.8), marginTop: 4}}>Avg insulin/day {insulin.avgDaily7.toFixed(1)}U</Text>
      </View>

      <View style={cardStyle(theme)}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Comparison</Text>
        <Text style={{color: theme.textColor}}>TIR {tirDelta >= 0 ? '+' : ''}{tirDelta}% • Hypo {lowDelta >= 0 ? '+' : ''}{lowDelta} • Severe {severeLowDelta >= 0 ? '+' : ''}{severeLowDelta}</Text>
      </View>

      <View style={cardStyle(theme)}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <Text style={{fontWeight: '700', color: theme.textColor}}>Today</Text>
          <Text style={{color: addOpacity(theme.textColor, 0.6), fontSize: 12}}>{actionSource === 'ai' ? 'AI' : 'Fallback'}</Text>
        </View>
        <Text style={{color: theme.textColor, marginTop: 4}}>{action}</Text>
        {whyLine ? <Text style={{color: addOpacity(theme.textColor, 0.72), marginTop: 6}}>{whyLine}</Text> : null}
      </View>
    </ScrollView>
  );
};

export default DailyReviewScreen;
