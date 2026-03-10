import React, {useMemo} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import {useRoute} from '@react-navigation/native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const TIERS = [
  {name: 'Bronze', color: '#b87333', minScore: 0, target: 'Base level'},
  {name: 'Silver', color: '#b0bec5', minScore: 35, target: 'TIR > 65%, fewer lows'},
  {name: 'Gold', color: '#fbc02d', minScore: 55, target: 'TIR > 72%, stable post-meal'},
  {name: 'Platinum', color: '#81d4fa', minScore: 75, target: 'TIR > 78%, very low hypo count'},
  {name: 'Diamond', color: '#4fc3f7', minScore: 90, target: 'TIR > 85%, minimal hypo/hyper'},
];

const LOW_PENALTY_PER_EVENT = 2.8;
const HIGH_PENALTY_PER_EVENT = 0.6;
const TIR_BONUS_FACTOR = 1.2;

const RanksInfoScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const route = useRoute<any>();
  const p = route.params ?? {};

  const score = Number(p.score ?? 0);
  const tir = Number(p.weeklyMetrics?.tir ?? 0);
  const lows = Number(p.weeklyMetrics?.lows ?? 0);
  const highs = Number(p.weeklyMetrics?.highs ?? 0);

  const neededPoints = useMemo(() => {
    if (!p.nextTier) return 0;
    const nextTier = TIERS.find(t => t.name === p.nextTier);
    if (!nextTier) return 0;
    return Math.max(0, nextTier.minScore - score);
  }, [p.nextTier, score]);

  const whatIf = useMemo(() => {
    if (!p.nextTier || neededPoints <= 0) {
      return 'You are at max tier. Keep consistency to maintain rank.';
    }

    const tirNeeded = Math.max(1, Math.ceil(neededPoints / TIR_BONUS_FACTOR));
    const lowsToReduce = Math.max(1, Math.ceil(neededPoints / LOW_PENALTY_PER_EVENT));
    const highsToReduce = Math.max(1, Math.ceil(neededPoints / HIGH_PENALTY_PER_EVENT));

    return {
      summary: `Need +${neededPoints} points to reach ${p.nextTier}.`,
      optionA: `Raise weekly TIR by ~${tirNeeded}%`,
      optionB: `Reduce weekly lows by ~${lowsToReduce} events`,
      optionC: `Reduce weekly highs by ~${highsToReduce} events`,
      optionMix: 'Or combine smaller improvements from all three.',
    };
  }, [neededPoints, p.nextTier]);

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 12}}>
      <Text style={{fontSize: 24, fontWeight: '800', color: theme.textColor}}>Rank System</Text>
      <Text style={{color: addOpacity(theme.textColor, 0.75)}}>
        Scoring window: last 7 completed days (not including today)
      </Text>

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor}}>Current rank</Text>
        <Text style={{color: theme.textColor, marginTop: 4}}>
          Tier: {p.tier ?? '-'} • Score: {score}
        </Text>
        <Text style={{color: addOpacity(theme.textColor, 0.78), marginTop: 2}}>
          Progress to {p.nextTier ?? 'max'}: {p.progressToNextPct ?? 0}%
        </Text>
      </View>

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor}}>Exact score formula</Text>
        <Text style={{color: theme.textColor, marginTop: 6}}>
          Score = Base + TIR bonus - Low penalty - High penalty
        </Text>
        <Text style={{color: addOpacity(theme.textColor, 0.85), marginTop: 6}}>
          = +{p.breakdown?.base ?? '-'} + {p.breakdown?.tirBonus ?? '-'} - {p.breakdown?.lowPenalty ?? '-'} - {p.breakdown?.highPenalty ?? '-'}
        </Text>
      </View>

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor}}>Why you got this score</Text>

        <Text style={{color: theme.textColor, marginTop: 8}}>TIR bonus</Text>
        <Text style={{color: addOpacity(theme.textColor, 0.82)}}>
          TIR {tir}% → (TIR - 50) × {TIR_BONUS_FACTOR} = +{p.breakdown?.tirBonus ?? '-'}
        </Text>

        <Text style={{color: theme.textColor, marginTop: 8}}>Low penalty</Text>
        <Text style={{color: addOpacity(theme.textColor, 0.82)}}>
          {lows} lows × {LOW_PENALTY_PER_EVENT} points = -{p.breakdown?.lowPenalty ?? '-'}
        </Text>

        <Text style={{color: theme.textColor, marginTop: 8}}>High penalty</Text>
        <Text style={{color: addOpacity(theme.textColor, 0.82)}}>
          {highs} highs × {HIGH_PENALTY_PER_EVENT} points = -{p.breakdown?.highPenalty ?? '-'}
        </Text>
      </View>

      <View style={{backgroundColor: addOpacity('#2e7d32', 0.12), borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor}}>What-if to rank up</Text>
        {typeof whatIf === 'string' ? (
          <Text style={{color: theme.textColor, marginTop: 6}}>{whatIf}</Text>
        ) : (
          <>
            <Text style={{color: theme.textColor, marginTop: 6}}>{whatIf.summary}</Text>
            <Text style={{color: theme.textColor, marginTop: 4}}>• {whatIf.optionA}</Text>
            <Text style={{color: theme.textColor}}>• {whatIf.optionB}</Text>
            <Text style={{color: theme.textColor}}>• {whatIf.optionC}</Text>
            <Text style={{color: addOpacity(theme.textColor, 0.8), marginTop: 4}}>{whatIf.optionMix}</Text>
          </>
        )}
      </View>

      {TIERS.map(t => (
        <View key={t.name} style={{backgroundColor: theme.white, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: addOpacity(t.color, 0.55)}}>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{t.name}</Text>
          <Text style={{color: addOpacity(theme.textColor, 0.8), marginTop: 4}}>Min score: {t.minScore}</Text>
          <Text style={{color: addOpacity(theme.textColor, 0.8)}}>{t.target}</Text>
        </View>
      ))}
    </ScrollView>
  );
};

export default RanksInfoScreen;
