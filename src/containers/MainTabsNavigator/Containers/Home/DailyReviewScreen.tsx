import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, View} from 'react-native';
import {subDays} from 'date-fns';
import {useTheme} from 'styled-components/native';

import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {getLatestDailyBrief, regenerateDailyBrief} from 'app/services/proactiveCare/dailyBrief';
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

  const streakText = y.lows === 0 ? 'Streak: 1 day without lows ✅' : 'Streak reset: lows detected';
  const heuristicAction = y.lows > 0 ? 'Action today: reduce stacking risk in afternoon' : 'Action today: keep current pattern';
  const action = llmActionLine || heuristicAction;

  if (loading) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 12}}>
      <Text style={{fontSize: 24, fontWeight: '700', color: theme.textColor}}>Daily Review</Text>
      <Text style={{color: addOpacity(theme.textColor, 0.7)}}>Yesterday vs last 7-day baseline</Text>

      <Pressable
        onPress={handleRegenerate}
        disabled={refreshingAction}
        style={{
          backgroundColor: theme.white,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: addOpacity(theme.textColor, 0.15),
          padding: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{color: theme.textColor, fontWeight: '700'}}>
          {refreshingAction ? 'Regenerating…' : 'Regenerate review and recommendation'}
        </Text>
      </Pressable>

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Yesterday</Text>
        <Text style={{color: theme.textColor}}>TIR: {y.tir}% | Avg: {y.avg} | Lows: {y.lows} | Highs: {y.highs}</Text>
      </View>

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>7-day baseline</Text>
        <Text style={{color: theme.textColor}}>TIR: {w.tir}% | Avg: {w.avg} | Lows: {w.lows} | Highs: {w.highs}</Text>
      </View>

      <View style={{backgroundColor: addOpacity(tirDelta >= 0 ? '#2e7d32' : '#c62828', 0.1), borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Comparison</Text>
        <Text style={{color: theme.textColor}}>TIR delta: {tirDelta >= 0 ? '+' : ''}{tirDelta}%</Text>
        <Text style={{color: theme.textColor}}>Low events delta: {lowDelta >= 0 ? '+' : ''}{lowDelta}</Text>
      </View>

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Momentum</Text>
        <Text style={{color: theme.textColor}}>{streakText}</Text>
      </View>

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>Today</Text>
        <Text style={{color: theme.textColor}}>{action}</Text>
      </View>
    </ScrollView>
  );
};

export default DailyReviewScreen;
