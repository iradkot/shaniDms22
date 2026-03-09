import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, View} from 'react-native';
import {subDays} from 'date-fns';
import {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {getLatestDailyBrief, regenerateDailyBrief} from 'app/services/proactiveCare/dailyBrief';
import {computeRank} from 'app/services/proactiveCare/streakRank';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';

type Row = {sgv: number; dateString?: string};

function metrics(rows: Row[]) {
  if (!rows.length) return {avg: 0, tir: 0, lows: 0, highs: 0};
  const avg = Math.round(rows.reduce((s, r) => s + r.sgv, 0) / rows.length);
  const lows = rows.filter(r => r.sgv < 70).length;
  const highs = rows.filter(r => r.sgv > 180).length;
  const tir = Math.round((rows.filter(r => r.sgv >= 70 && r.sgv <= 180).length / rows.length) * 100);
  return {avg, tir, lows, highs};
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
  const {settings: aiSettings} = useAiSettings();
  const {settings: glucoseSettings} = useGlucoseSettings();

  const [loading, setLoading] = useState(true);
  const [refreshingAction, setRefreshingAction] = useState(false);
  const [yesterdayRows, setYesterdayRows] = useState<Row[]>([]);
  const [weekRows, setWeekRows] = useState<Row[]>([]);
  const [llmActionLine, setLlmActionLine] = useState<string | null>(null);

  const loadData = async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const yStart = subDays(todayStart, 1);
    const wStart = subDays(todayStart, 8);

    const [y, w, latestBrief] = await Promise.all([
      fetchBgDataForDateRangeUncached(yStart, todayStart, {throwOnError: false}),
      fetchBgDataForDateRangeUncached(wStart, yStart, {throwOnError: false}),
      getLatestDailyBrief(),
    ]);

    setYesterdayRows((y as any) ?? []);
    setWeekRows((w as any) ?? []);

    if (latestBrief?.body) {
      const lines = latestBrief.body.split('\n').map(s => s.trim()).filter(Boolean);
      const action = lines.find(l => l.startsWith('🎯')) || lines[2] || null;
      setLlmActionLine(action);
    } else {
      setLlmActionLine(null);
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
  const streakText = y.lows === 0 ? '1 day without lows ✅' : 'Streak reset: lows detected';
  const heuristicAction = y.lows > 0 ? 'Action today: reduce stacking risk in afternoon' : 'Action today: keep current pattern';
  const action = llmActionLine || heuristicAction;

  const rank = useMemo(
    () => computeRank({tir: w.tir || y.tir, lows: w.lows, highs: w.highs}),
    [w.tir, w.lows, w.highs, y.tir],
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
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 12}}>
      <Text style={{fontSize: 24, fontWeight: '800', color: theme.textColor}}>Daily Review</Text>
      <Text style={{color: addOpacity(theme.textColor, 0.65)}}>Yesterday vs 7-day baseline</Text>

      <View style={{...cardStyle(theme), backgroundColor: addOpacity(rv.color, 0.14), borderColor: addOpacity(rv.color, 0.6)}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 16}}>{rv.emoji} Ranked Streak</Text>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{rank.tier}</Text>
        </View>
        <Text style={{color: theme.textColor, marginTop: 4}}>Score {rank.score}</Text>

        <View style={{height: 8, borderRadius: 10, backgroundColor: addOpacity(theme.textColor, 0.12), marginTop: 8}}>
          <View
            style={{
              height: 8,
              borderRadius: 10,
              width: `${Math.max(4, rank.progressToNextPct)}%`,
              backgroundColor: rv.color,
            }}
          />
        </View>

        <Text style={{color: addOpacity(theme.textColor, 0.8), marginTop: 6}}>
          {rank.nextTier ? `Progress to ${rank.nextTier}: ${rank.progressToNextPct}%` : 'Max tier reached'}
        </Text>
        <Text style={{color: addOpacity(theme.textColor, 0.85), marginTop: 4}}>Goal: {rank.shortGoal}</Text>
      </View>

      <Pressable
        onPress={handleRegenerate}
        disabled={refreshingAction}
        style={{
          ...cardStyle(theme),
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: refreshingAction ? addOpacity(theme.accentColor, 0.12) : theme.white,
        }}
      >
        <MaterialIcons name="auto-fix-high" size={18} color={theme.textColor} />
        <Text style={{color: theme.textColor, fontWeight: '700'}}>
          {refreshingAction ? 'Regenerating…' : 'Regenerate review & recommendation'}
        </Text>
      </Pressable>

      <View style={cardStyle(theme)}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Yesterday</Text>
        <Text style={{color: theme.textColor}}>TIR {y.tir}% • Avg {y.avg} • Lows {y.lows} • Highs {y.highs}</Text>
      </View>

      <View style={cardStyle(theme)}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>7-day baseline</Text>
        <Text style={{color: theme.textColor}}>TIR {w.tir}% • Avg {w.avg} • Lows {w.lows} • Highs {w.highs}</Text>
      </View>

      <View style={{...cardStyle(theme), backgroundColor: addOpacity(tirDelta >= 0 ? '#2e7d32' : '#c62828', 0.1)}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Comparison</Text>
        <Text style={{color: theme.textColor}}>TIR delta: {tirDelta >= 0 ? '+' : ''}{tirDelta}%</Text>
        <Text style={{color: theme.textColor}}>Low delta: {lowDelta >= 0 ? '+' : ''}{lowDelta}</Text>
      </View>

      <View style={cardStyle(theme)}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Momentum</Text>
        <Text style={{color: theme.textColor}}>{streakText}</Text>
      </View>

      <View style={cardStyle(theme)}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Today</Text>
        <Text style={{color: theme.textColor}}>{action}</Text>
      </View>
    </ScrollView>
  );
};

export default DailyReviewScreen;
