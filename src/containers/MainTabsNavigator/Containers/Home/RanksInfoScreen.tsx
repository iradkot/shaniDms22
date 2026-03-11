import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import {useRoute} from '@react-navigation/native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const TIERS = [
  {name: 'Bronze', minScore: 0},
  {name: 'Silver', minScore: 35},
  {name: 'Gold', minScore: 55},
  {name: 'Platinum', minScore: 75},
  {name: 'Diamond', minScore: 90},
] as const;

const TIR_BONUS_FACTOR = 1.2;
const LOW_IMPACT_PER_READING = 2.8;
const HIGH_IMPACT_PER_READING = 0.6;

function tierIcon(name: string) {
  switch (name) {
    case 'Diamond':
      return '💎';
    case 'Platinum':
      return '🛡️';
    case 'Gold':
      return '🏆';
    case 'Silver':
      return '🥈';
    default:
      return '🥉';
  }
}

function nextTierMinScore(nextTier?: string | null) {
  if (!nextTier) return null;
  const row = TIERS.find(t => t.name === nextTier);
  return row?.minScore ?? null;
}

const RanksInfoScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const route = useRoute<any>();
  const p = route.params ?? {};

  const [showMath, setShowMath] = useState(false);

  const tier = String(p.tier ?? 'Bronze');
  const score = Number(p.score ?? 0);
  const nextTier = p.nextTier ? String(p.nextTier) : null;

  const base = Number(p.breakdown?.base ?? 35);
  const tirBonus = Number(p.breakdown?.tirBonus ?? 0);
  const lowImpact = Number(p.breakdown?.lowPenalty ?? 0);
  const highImpact = Number(p.breakdown?.highPenalty ?? 0);

  const tirCurrent = Number(p.weeklyMetrics?.tir ?? 0);
  const lowsCurrent = Number(p.weeklyMetrics?.lows ?? 0);
  const highsCurrent = Number(p.weeklyMetrics?.highs ?? 0);

  const pointsToNext = useMemo(() => {
    const target = nextTierMinScore(nextTier);
    if (target == null) return 0;
    return Math.max(0, target - score);
  }, [nextTier, score]);

  const goals = useMemo(() => {
    if (!nextTier || pointsToNext <= 0) {
      return {
        headline: 'אתה בדרגה המקסימלית כרגע 👑',
        tirTarget: tirCurrent,
        lowsTarget: lowsCurrent,
        highsTarget: highsCurrent,
      };
    }

    const tirImprovement = Math.max(1, Math.ceil(pointsToNext / TIR_BONUS_FACTOR));
    const lowsReduction = Math.max(1, Math.ceil(pointsToNext / LOW_IMPACT_PER_READING));
    const highsReduction = Math.max(1, Math.ceil(pointsToNext / HIGH_IMPACT_PER_READING));

    return {
      headline: `עוד ${pointsToNext} נק׳ ל-${nextTier}`,
      tirTarget: Math.min(100, tirCurrent + tirImprovement),
      lowsTarget: Math.max(0, lowsCurrent - lowsReduction),
      highsTarget: Math.max(0, highsCurrent - highsReduction),
    };
  }, [nextTier, pointsToNext, tirCurrent, lowsCurrent, highsCurrent]);

  const currentTierColor =
    tier === 'Diamond'
      ? theme.accentColor
      : tier === 'Platinum'
      ? theme.inRangeColor
      : tier === 'Gold'
      ? theme.aboveRangeColor
      : tier === 'Silver'
      ? addOpacity(theme.textColor, 0.55)
      : theme.belowRangeColor;

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 12}}>
      {/* HERO */}
      <View
        style={{
          backgroundColor: addOpacity(currentTierColor, 0.12),
          borderColor: addOpacity(currentTierColor, 0.45),
          borderWidth: 1,
          borderRadius: 18,
          padding: 16,
        }}>
        <View style={{alignItems: 'center'}}>
          <Text style={{fontSize: 44}}>{tierIcon(tier)}</Text>
          <Text style={{marginTop: 6, fontSize: 24, fontWeight: '800', color: theme.textColor}}>{tier}</Text>
          <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.85), fontWeight: '700'}}>ציון {score}</Text>
          <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.8)}}>{goals.headline}</Text>
        </View>
      </View>

      {/* GOALS */}
      <View style={{backgroundColor: theme.white, borderRadius: 14, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 16}}>היעדים שלך ל-7 הימים הקרובים</Text>
        <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.72)}}>הציון מתעדכן כל יום לפי 7 הימים האחרונים</Text>

        <View style={{marginTop: 10, gap: 8}}>
          <View style={{backgroundColor: addOpacity(theme.inRangeColor, 0.12), borderRadius: 10, padding: 10}}>
            <Text style={{fontWeight: '700', color: theme.textColor}}>זמן בטווח (TIR)</Text>
            <Text style={{marginTop: 2, color: theme.textColor}}>יעד: {goals.tirTarget}% | כרגע: {tirCurrent}%</Text>
          </View>

          <View style={{backgroundColor: addOpacity(theme.belowRangeColor, 0.1), borderRadius: 10, padding: 10}}>
            <Text style={{fontWeight: '700', color: theme.textColor}}>קריאות Low</Text>
            <Text style={{marginTop: 2, color: theme.textColor}}>יעד: {goals.lowsTarget} | כרגע: {lowsCurrent}</Text>
          </View>

          <View style={{backgroundColor: addOpacity(theme.aboveRangeColor, 0.1), borderRadius: 10, padding: 10}}>
            <Text style={{fontWeight: '700', color: theme.textColor}}>קריאות High</Text>
            <Text style={{marginTop: 2, color: theme.textColor}}>יעד: {goals.highsTarget} | כרגע: {highsCurrent}</Text>
          </View>
        </View>

        <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.75)}}>
          לא חייבים להשיג הכול — כל שיפור קטן מקרב לדרגה הבאה.
        </Text>
      </View>

      {/* SCORE BREAKDOWN */}
      <View style={{backgroundColor: theme.white, borderRadius: 14, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 16}}>הרכב הציון שלך</Text>
        <Text style={{marginTop: 8, color: theme.textColor}}>זמן בטווח: +{tirBonus}</Text>
        <Text style={{color: theme.textColor}}>השפעת קריאות Low: -{lowImpact}</Text>
        <Text style={{color: theme.textColor}}>השפעת קריאות High: -{highImpact}</Text>

        <Pressable onPress={() => setShowMath(v => !v)} style={{marginTop: 10}}>
          <Text style={{color: theme.accentColor, fontWeight: '700'}}>{showMath ? 'הסתר חישוב מפורט' : 'הצג חישוב מפורט'}</Text>
        </Pressable>

        {showMath ? (
          <View style={{marginTop: 8, backgroundColor: addOpacity(theme.textColor, 0.06), borderRadius: 10, padding: 10}}>
            <Text style={{color: theme.textColor}}>Score = Base + TIR bonus - Low impact - High impact</Text>
            <Text style={{color: theme.textColor, marginTop: 4}}>
              = {base} + {tirBonus} - {lowImpact} - {highImpact}
            </Text>
            <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.75)}}>
              נוסחת השפעה: (TIR-50)×{TIR_BONUS_FACTOR} | Low×{LOW_IMPACT_PER_READING} | High×{HIGH_IMPACT_PER_READING}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ROADMAP */}
      <View style={{backgroundColor: theme.white, borderRadius: 14, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 16}}>מפת דרגות</Text>
        <View style={{marginTop: 8, gap: 8}}>
          {TIERS.map(t => {
            const unlocked = score >= t.minScore;
            const active = t.name === tier;
            return (
              <View
                key={t.name}
                style={{
                  borderRadius: 10,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: addOpacity(theme.textColor, active ? 0.35 : 0.18),
                  backgroundColor: unlocked ? addOpacity(theme.inRangeColor, active ? 0.18 : 0.08) : addOpacity(theme.textColor, 0.04),
                }}>
                <Text style={{fontWeight: '800', color: theme.textColor}}>{tierIcon(t.name)} {t.name}</Text>
                <Text style={{color: addOpacity(theme.textColor, 0.78), marginTop: 2}}>ציון מינימלי: {t.minScore}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
};

export default RanksInfoScreen;
