import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import {useRoute} from '@react-navigation/native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const TIERS = [
  {name: 'Bronze', color: '#b87333', minScore: 0, target: 'בסיס יציב'},
  {name: 'Silver', color: '#b0bec5', minScore: 35, target: 'שיפור יציבות יומי'},
  {name: 'Gold', color: '#fbc02d', minScore: 55, target: 'ביצועים טובים ועקביים'},
  {name: 'Platinum', color: '#81d4fa', minScore: 75, target: 'מעט חריגות, שליטה גבוהה'},
  {name: 'Diamond', color: '#4fc3f7', minScore: 90, target: 'רמה עליונה'},
];

const TIR_BONUS_FACTOR = 1.2;
const LOW_IMPACT_PER_EVENT = 2.8;
const HIGH_IMPACT_PER_EVENT = 0.6;

function tierIcon(name: string) {
  switch (name) {
    case 'Diamond': return '💎';
    case 'Platinum': return '🛡️';
    case 'Gold': return '🏆';
    case 'Silver': return '🥈';
    default: return '🥉';
  }
}

const RanksInfoScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;
  const route = useRoute<any>();
  const p = route.params ?? {};
  const [showMath, setShowMath] = useState(false);

  const score = Number(p.score ?? 0);
  const tier = String(p.tier ?? 'Bronze');
  const nextTier = p.nextTier ? String(p.nextTier) : null;
  const progress = Number(p.progressToNextPct ?? 0);

  const tir = Number(p.weeklyMetrics?.tir ?? 0);
  const lows = Number(p.weeklyMetrics?.lows ?? 0);
  const highs = Number(p.weeklyMetrics?.highs ?? 0);

  const base = Number(p.breakdown?.base ?? 35);
  const tirBonus = Number(p.breakdown?.tirBonus ?? 0);
  const lowImpact = Number(p.breakdown?.lowPenalty ?? 0);
  const highImpact = Number(p.breakdown?.highPenalty ?? 0);

  const pointsToNext = useMemo(() => {
    if (!nextTier) return 0;
    const t = TIERS.find(x => x.name === nextTier);
    if (!t) return 0;
    return Math.max(0, t.minScore - score);
  }, [nextTier, score]);

  const whatIf = useMemo(() => {
    if (!nextTier || pointsToNext <= 0) {
      return {
        headline: 'אתה ברמה הגבוהה ביותר כרגע 👑',
        tasks: ['שמור על עקביות במדדים השבועיים'],
      };
    }

    const tirNeeded = Math.max(1, Math.ceil(pointsToNext / TIR_BONUS_FACTOR));
    const lowDrop = Math.max(1, Math.ceil(pointsToNext / LOW_IMPACT_PER_EVENT));
    const highDrop = Math.max(1, Math.ceil(pointsToNext / HIGH_IMPACT_PER_EVENT));

    return {
      headline: `עוד ${pointsToNext} נק׳ ל-${nextTier}`,
      tasks: [
        `🎯 העלאת TIR שבועי בכ~${tirNeeded}%`,
        `🎯 הורדת אירועי Low בכ~${lowDrop}`,
        `🎯 הורדת אירועי High בכ~${highDrop}`,
        'לא חייבים הכול — כל שיפור קטן מקדם אותך',
      ],
    };
  }, [nextTier, pointsToNext]);

  const tierColor = TIERS.find(t => t.name === tier)?.color ?? '#b87333';

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 12}}>
      {/* HERO */}
      <View style={{backgroundColor: addOpacity(tierColor, 0.14), borderColor: addOpacity(tierColor, 0.6), borderWidth: 1, borderRadius: 18, padding: 16}}>
        <View style={{alignItems: 'center'}}>
          <View style={{width: 110, height: 110, borderRadius: 55, borderWidth: 8, borderColor: addOpacity(tierColor, 0.35), alignItems: 'center', justifyContent: 'center', backgroundColor: theme.white}}>
            <Text style={{fontSize: 36}}>{tierIcon(tier)}</Text>
          </View>
          <Text style={{marginTop: 10, fontSize: 24, fontWeight: '800', color: theme.textColor}}>{tier}</Text>
          <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.8), fontWeight: '700'}}>ציון {score}</Text>
          <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.8)}}>{nextTier ? `עוד ${pointsToNext} נק׳ בלבד ל-${nextTier}` : 'רמה מקסימלית הושגה'}</Text>
        </View>

        <View style={{height: 10, borderRadius: 12, backgroundColor: addOpacity(theme.textColor, 0.12), marginTop: 14}}>
          <View style={{height: 10, borderRadius: 12, width: `${Math.max(4, progress)}%`, backgroundColor: tierColor}} />
        </View>
      </View>

      {/* MISSIONS */}
      <View style={{backgroundColor: addOpacity('#2e7d32', 0.12), borderRadius: 14, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 16}}>המשימות שלי לשדרוג</Text>
        <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.8), fontWeight: '700'}}>{whatIf.headline}</Text>
        {whatIf.tasks.map((t, idx) => (
          <Text key={idx} style={{marginTop: 6, color: theme.textColor}}>{t}</Text>
        ))}
      </View>

      {/* SCORE BREAKDOWN */}
      <View style={{backgroundColor: theme.white, borderRadius: 14, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 16}}>הרכב הציון שלך</Text>

        <View style={{marginTop: 8, gap: 6}}>
          <Text style={{color: theme.textColor}}>זמן בטווח (TIR): +{tirBonus}</Text>
          <Text style={{color: theme.textColor}}>השפעת אירועי Low: -{lowImpact}</Text>
          <Text style={{color: theme.textColor}}>השפעת אירועי High: -{highImpact}</Text>
        </View>

        <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.78)}}>
          חלון חישוב: 7 ימים שהסתיימו (בלי היום הנוכחי)
        </Text>

        <Pressable onPress={() => setShowMath(v => !v)} style={{marginTop: 10}}>
          <Text style={{color: theme.accentColor, fontWeight: '700'}}>{showMath ? 'הסתר נוסחה' : 'הצג נוסחה מלאה'}</Text>
        </Pressable>

        {showMath ? (
          <View style={{marginTop: 8, backgroundColor: addOpacity(theme.textColor, 0.06), borderRadius: 10, padding: 10}}>
            <Text style={{color: theme.textColor}}>Score = Base + TIR bonus - Low impact - High impact</Text>
            <Text style={{color: theme.textColor, marginTop: 4}}>
              = {base} + {tirBonus} - {lowImpact} - {highImpact}
            </Text>
            <Text style={{color: addOpacity(theme.textColor, 0.75), marginTop: 6}}>
              TIR {tir}% • Lows {lows} • Highs {highs}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ROADMAP */}
      <View style={{backgroundColor: theme.white, borderRadius: 14, padding: 12}}>
        <Text style={{fontWeight: '800', color: theme.textColor, fontSize: 16}}>מפת דרגות</Text>
        <View style={{marginTop: 8, gap: 8}}>
          {TIERS.map((t, idx) => {
            const active = t.name === tier;
            const unlocked = score >= t.minScore;
            return (
              <View key={t.name} style={{borderRadius: 10, padding: 10, borderWidth: 1, borderColor: addOpacity(t.color, 0.55), backgroundColor: unlocked ? addOpacity(t.color, active ? 0.2 : 0.1) : addOpacity(theme.textColor, 0.04)}}>
                <Text style={{fontWeight: '800', color: theme.textColor}}>{tierIcon(t.name)} {t.name}</Text>
                <Text style={{color: addOpacity(theme.textColor, 0.8), marginTop: 2}}>מינימום: {t.minScore} נק׳</Text>
                <Text style={{color: addOpacity(theme.textColor, 0.8)}}>{t.target}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
};

export default RanksInfoScreen;
