import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import {useRoute} from '@react-navigation/native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const TIERS = [
  {name: 'Bronze', color: '#b87333', target: 'Base level'},
  {name: 'Silver', color: '#b0bec5', target: 'TIR > 65%, fewer lows'},
  {name: 'Gold', color: '#fbc02d', target: 'TIR > 72%, stable post-meal'},
  {name: 'Platinum', color: '#81d4fa', target: 'TIR > 78%, very low hypo count'},
  {name: 'Diamond', color: '#4fc3f7', target: 'TIR > 85%, minimal hypo/hyper'},
];

function estimateWhatIf(params: {
  score: number;
  nextTier?: string | null;
  progressToNextPct?: number;
  tir?: number;
  lows?: number;
  highs?: number;
}) {
  const score = Number(params.score ?? 0);
  const targetScore =
    params.nextTier === 'Silver' ? 35 :
    params.nextTier === 'Gold' ? 55 :
    params.nextTier === 'Platinum' ? 75 :
    params.nextTier === 'Diamond' ? 90 :
    null;

  if (!targetScore || score >= targetScore) {
    return 'You are already at max tier. Keep consistency.';
  }

  const gap = targetScore - score;
  const tirBoost = Math.max(1, Math.ceil(gap / 2));
  const lowCut = Math.max(1, Math.ceil(gap / 3));

  return `To reach ${params.nextTier}, try one of these: +${tirBoost}% weekly TIR or ${lowCut} fewer weekly lows.`;
}

const RanksInfoScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const route = useRoute<any>();
  const p = route.params ?? {};
  const whatIfText = estimateWhatIf({
    score: p.score,
    nextTier: p.nextTier,
    progressToNextPct: p.progressToNextPct,
    tir: p.weeklyMetrics?.tir,
    lows: p.weeklyMetrics?.lows,
    highs: p.weeklyMetrics?.highs,
  });

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 12}}>
      <Text style={{fontSize: 24, fontWeight: '800', color: theme.textColor}}>Rank System</Text>

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor}}>Your current score</Text>
        <Text style={{color: theme.textColor, marginTop: 4}}>
          Tier: {p.tier ?? '-'} • Score: {p.score ?? '-'}
        </Text>
        <Text style={{color: addOpacity(theme.textColor, 0.78), marginTop: 2}}>
          Progress to {p.nextTier ?? 'max'}: {p.progressToNextPct ?? 0}%
        </Text>
      </View>

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor}}>How score is calculated</Text>
        <Text style={{color: theme.textColor, marginTop: 6}}>Base: +{p.breakdown?.base ?? '-'}</Text>
        <Text style={{color: theme.textColor}}>TIR bonus: +{p.breakdown?.tirBonus ?? '-'}</Text>
        <Text style={{color: theme.textColor}}>Low penalty: -{p.breakdown?.lowPenalty ?? '-'}</Text>
        <Text style={{color: theme.textColor}}>High penalty: -{p.breakdown?.highPenalty ?? '-'}</Text>
        <Text style={{color: addOpacity(theme.textColor, 0.78), marginTop: 6}}>
          Weekly metrics used: TIR {p.weeklyMetrics?.tir ?? '-'}% • Lows {p.weeklyMetrics?.lows ?? '-'} • Highs {p.weeklyMetrics?.highs ?? '-'}
        </Text>
      </View>

      <View style={{backgroundColor: addOpacity('#2e7d32', 0.12), borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor}}>What if</Text>
        <Text style={{color: theme.textColor, marginTop: 6}}>{whatIfText}</Text>
      </View>

      {TIERS.map(t => (
        <View key={t.name} style={{backgroundColor: theme.white, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: addOpacity(t.color, 0.55)}}>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{t.name}</Text>
          <Text style={{color: addOpacity(theme.textColor, 0.8), marginTop: 4}}>{t.target}</Text>
        </View>
      ))}
    </ScrollView>
  );
};

export default RanksInfoScreen;
