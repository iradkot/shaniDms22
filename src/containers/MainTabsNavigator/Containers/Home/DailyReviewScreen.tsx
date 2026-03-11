import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, I18nManager, Pressable, ScrollView, Text, View} from 'react-native';
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
import TimeInRangeRow from './components/TimeInRangeRow';
import {
  extractBasalProfileFromNightscoutProfileData,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';
import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';

type Row = {sgv: number; dateString?: string};

function averageBg(rows: Row[]) {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + r.sgv, 0) / rows.length);
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

function formatDelta(value: number, unit = '') {
  const abs = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${abs}${unit}`;
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

  const isRtl = I18nManager.isRTL;
  const textAlign: 'left' | 'right' = isRtl ? 'right' : 'left';

  const todayStart = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
  }, []);
  const yStart = useMemo(() => subDays(todayStart, 1), [todayStart]);
  const prevDayStart = useMemo(() => subDays(yStart, 1), [yStart]);
  const wStart = useMemo(() => subDays(todayStart, 8), [todayStart]);

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
    const [y, w, latestBriefRaw] = await Promise.all([
      fetchBgDataForDateRangeUncached(yStart, todayStart, {throwOnError: false}),
      fetchBgDataForDateRangeUncached(wStart, yStart, {throwOnError: false}),
      getLatestDailyBrief(),
    ]);

    setYRows((y as any) ?? []);
    setWRows((w as any) ?? []);

    let latestBrief: any = latestBriefRaw;

    try {
      const yesterdayTotal = await getDayInsulinTotal(yStart);
      const prevDayTotal = await getDayInsulinTotal(prevDayStart);
      let weekSum = 0;
      for (let i = 1; i <= 7; i++) weekSum += await getDayInsulinTotal(subDays(todayStart, i));
      setInsulin({yesterday: yesterdayTotal, prevDay: prevDayTotal, avgDaily7: weekSum / 7});
    } catch {
      setInsulin({yesterday: 0, prevDay: 0, avgDaily7: 0});
    }

    if (latestBrief?.source === 'fallback' && aiSettings.enabled && (aiSettings.apiKey || '').trim()) {
      try {
        const regenerated = await regenerateDailyBrief({
          glucose: glucoseSettings,
          ai: {
            enabled: aiSettings.enabled,
            apiKey: aiSettings.apiKey,
            model: aiSettings.openAiModel,
          },
          notify: false,
        });
        latestBrief = {
          title: regenerated.title,
          body: regenerated.body,
          source: regenerated.source,
        } as any;
      } catch {
        // keep fallback
      }
    }

    if (latestBrief?.body) {
      const lines = latestBrief.body.split('\n').map((s: string) => s.trim()).filter(Boolean);
      setLlmActionLine(lines.find((l: string) => l.startsWith('🎯')) || lines[2] || null);
      setWhyLine(lines.find((l: string) => l.startsWith('🧠')) || null);
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
    return () => { mounted = false; };
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

  const yAvg = useMemo(() => averageBg(yRows), [yRows]);
  const wAvg = useMemo(() => averageBg(wRows), [wRows]);

  const yTirPct = useMemo(() => {
    if (!yRows.length) return 0;
    const inRange = yRows.filter(r => r.sgv >= (glucoseSettings.hypo ?? 70) && r.sgv <= (glucoseSettings.hyper ?? 180)).length;
    return Math.round((inRange / yRows.length) * 100);
  }, [yRows, glucoseSettings.hypo, glucoseSettings.hyper]);

  const wTirPct = useMemo(() => {
    if (!wRows.length) return 0;
    const inRange = wRows.filter(r => r.sgv >= (glucoseSettings.hypo ?? 70) && r.sgv <= (glucoseSettings.hyper ?? 180)).length;
    return Math.round((inRange / wRows.length) * 100);
  }, [wRows, glucoseSettings.hypo, glucoseSettings.hyper]);

  const yLows = useMemo(() => yRows.filter(r => r.sgv < (glucoseSettings.hypo ?? 70)).length, [yRows, glucoseSettings.hypo]);
  const yHighs = useMemo(() => yRows.filter(r => r.sgv > (glucoseSettings.hyper ?? 180)).length, [yRows, glucoseSettings.hyper]);
  const wLows = useMemo(() => wRows.filter(r => r.sgv < (glucoseSettings.hypo ?? 70)).length, [wRows, glucoseSettings.hypo]);
  const wHighs = useMemo(() => wRows.filter(r => r.sgv > (glucoseSettings.hyper ?? 180)).length, [wRows, glucoseSettings.hyper]);

  const rank = useMemo(
    () => computeRank({tir: wTirPct || yTirPct, lows: wLows, highs: wHighs}),
    [wTirPct, yTirPct, wLows, wHighs],
  );
  const rv = tierVisual(rank.tier);

  const tirDelta = yTirPct - wTirPct;
  const insulinDelta = insulin.yesterday - insulin.prevDay;

  const keyInsight = useMemo(() => {
    if (!yRows.length) return 'אין מספיק נתוני סוכר מאתמול כדי לזהות מגמה ברורה.';
    if (yLows > yHighs && yLows > 0) return `הנקודה המרכזית: היו יותר נפילות (${yLows}) מעליות (${yHighs}).`;
    if (yHighs > yLows && yHighs > 0) return `הנקודה המרכזית: היו יותר עליות (${yHighs}) מנפילות (${yLows}).`;
    return 'היום היה יחסית מאוזן בין עליות לנפילות.';
  }, [yRows.length, yLows, yHighs]);

  const naturalSummary = useMemo(() => {
    if (!yRows.length) return 'אתמול לא נאספו מספיק נתונים, לכן אי אפשר לתת סיכום אמין.';
    const tirPart = `זמן בטווח היה ${yTirPct}%`;
    const trendPart = wRows.length
      ? `(${tirDelta >= 0 ? 'שיפור' : 'ירידה'} של ${Math.abs(tirDelta)}% לעומת ממוצע 7 ימים)`
      : '(אין מספיק השוואה שבועית)';
    return `אתמול: ${tirPart} ${trendPart}. ממוצע הסוכר היה ${yAvg}.`;
  }, [yRows.length, yTirPct, tirDelta, yAvg, wRows.length]);

  const actionText = llmActionLine || (yRows.length
    ? 'להיום: לשמור על שגרה יציבה, להימנע מתיקונים צפופים, ולבדוק מגמה לפני החלטה.'
    : 'להיום: להתחיל באיסוף נתונים רציף כדי שנוכל לייצר המלצה מדויקת יותר.');

  const card = {backgroundColor: theme.white, borderRadius: 14, padding: 12};

  if (loading) {
    return <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}><ActivityIndicator /></View>;
  }

  return (
    <ScrollView
      style={{flex: 1, backgroundColor: theme.backgroundColor}}
      contentContainerStyle={{padding: 16, gap: 10}}
    >
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
        <Pressable onPress={() => navigation.goBack()} style={{padding: 4}}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textColor} />
        </Pressable>
        <Text style={{fontSize: 24, fontWeight: '800', color: theme.textColor, textAlign}}>סיכום היום הקודם</Text>
        <View style={{width: 24}} />
      </View>

      <Pressable
        onPress={() =>
          navigation.navigate(RANKS_INFO_SCREEN, {
            tier: rank.tier,
            score: rank.score,
            nextTier: rank.nextTier,
            progressToNextPct: rank.progressToNextPct,
            breakdown: rank.breakdown,
            weeklyMetrics: {tir: wTirPct, lows: wLows, highs: wHighs},
          })
        }
        style={{...card, backgroundColor: addOpacity(rv.color, 0.14), borderWidth: 1, borderColor: addOpacity(rv.color, 0.6)}}
      >
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{rv.emoji} {rank.tier}</Text>
          <Text style={{fontWeight: '700', color: addOpacity(theme.textColor, 0.7)}}>ציון {rank.score}</Text>
        </View>
        <View style={{height: 8, borderRadius: 10, backgroundColor: addOpacity(theme.textColor, 0.12), marginTop: 8}}>
          <View style={{height: 8, borderRadius: 10, width: `${Math.max(5, rank.progressToNextPct)}%`, backgroundColor: rv.color}} />
        </View>
      </Pressable>

      <View style={card}>
        <Text style={{fontWeight: '800', color: theme.textColor, textAlign}}>איך עבר אתמול</Text>
        <Text style={{marginTop: 6, color: theme.textColor, textAlign}}>{naturalSummary}</Text>
      </View>

      <View style={card}>
        <Text style={{fontWeight: '800', color: theme.textColor, textAlign}}>מה הכי חשוב לדעת</Text>
        <Text style={{marginTop: 6, color: theme.textColor, textAlign}}>{keyInsight}</Text>
        <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.75), textAlign}}>
          אינסולין אתמול: {insulin.yesterday > 0 ? `${insulin.yesterday.toFixed(1)} יח׳` : 'אין נתון'}
          {insulin.yesterday > 0 && insulin.prevDay > 0 ? ` (${formatDelta(Number(insulinDelta.toFixed(1)), ' יח׳')} מול יום קודם)` : ''}
          {insulin.avgDaily7 > 0 ? ` • ממוצע 7 ימים: ${insulin.avgDaily7.toFixed(1)} יח׳` : ''}
        </Text>
      </View>

      <View style={card}>
        <Text style={{fontWeight: '800', color: theme.textColor, textAlign}}>מה כדאי לעשות היום</Text>
        <Text style={{marginTop: 6, color: theme.textColor, textAlign}}>{actionText}</Text>
        {whyLine ? (
          <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.75), textAlign}}>{whyLine}</Text>
        ) : null}
        <Text style={{marginTop: 4, fontSize: 12, color: addOpacity(theme.textColor, 0.6), textAlign}}>
          מקור המלצה: {actionSource === 'ai' ? 'AI' : 'בסיסי'}
        </Text>
      </View>

      <View style={card}>
        <Text style={{fontWeight: '700', color: theme.textColor, textAlign}}>פירוט טווח סוכר</Text>
        <View style={{marginTop: 6}}>
          {yRows.length ? (
            <TimeInRangeRow bgData={yRows as any} />
          ) : (
            <Text style={{color: addOpacity(theme.textColor, 0.75), textAlign}}>אין מספיק נתונים להצגת פירוט טווח.</Text>
          )}
        </View>
        <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.75), textAlign}}>
          השוואת שבוע: TIR {wTirPct}% • נמוכים {wLows} • גבוהים {wHighs} • ממוצע {wAvg || '-'}
        </Text>
      </View>

      <Pressable onPress={handleRegenerate} disabled={refreshingAction} style={{...card, alignItems: 'center'}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>{refreshingAction ? 'מעדכן המלצה…' : 'רענון המלצה'}</Text>
      </Pressable>
    </ScrollView>
  );
};

export default DailyReviewScreen;
