/* eslint-disable react-native/no-inline-styles */
import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';

type YesNo = 'yes' | 'no' | null;

type OptionRowProps = {
  label: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
  theme: ThemeType;
  language: string;
};

const OptionRow: React.FC<OptionRowProps> = ({label, value, onChange, theme, language}) => (
  <View style={{marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.15), backgroundColor: theme.white}}>
    <Text style={{color: theme.textColor, fontWeight: '700'}}>{label}</Text>
    <View style={{marginTop: 8, flexDirection: 'row', gap: 8}}>
      <Pressable onPress={() => onChange('yes')} style={{paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: value === 'yes' ? theme.accentColor : addOpacity(theme.textColor, 0.2), backgroundColor: value === 'yes' ? addOpacity(theme.accentColor, 0.12) : 'transparent'}}>
        <Text style={{color: theme.textColor}}>{language === 'he' ? 'כן' : 'Yes'}</Text>
      </Pressable>
      <Pressable onPress={() => onChange('no')} style={{paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: value === 'no' ? theme.accentColor : addOpacity(theme.textColor, 0.2), backgroundColor: value === 'no' ? addOpacity(theme.accentColor, 0.12) : 'transparent'}}>
        <Text style={{color: theme.textColor}}>{language === 'he' ? 'לא' : 'No'}</Text>
      </Pressable>
    </View>
  </View>
);

const LoopAdjustmentAssistScreen: React.FC<any> = ({route}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();

  const trend = route?.params?.trend ?? null;

  const [stressOrSick, setStressOrSick] = useState<YesNo>(null);
  const [specialExercise, setSpecialExercise] = useState<YesNo>(null);
  const [pumpSetOk, setPumpSetOk] = useState<YesNo>(null);

  const score = useMemo(() => {
    const base = Number(trend?.confidence ?? 0.5);
    let s = base;
    if (stressOrSick === 'yes') {
      s -= 0.15;
    }
    if (specialExercise === 'yes') {
      s -= 0.12;
    }
    if (pumpSetOk === 'no') {
      s -= 0.22;
    }
    return Math.max(0, Math.min(1, s));
  }, [pumpSetOk, specialExercise, stressOrSick, trend?.confidence]);

  const recommendation = useMemo(() => {
    if (!trend?.detected) {
      return language === 'he'
        ? 'כרגע אין דפוס יציב מספיק לשינוי הגדרות לופ. עדיף להמשיך מעקב עוד כמה ימים.'
        : 'There is no stable enough pattern yet for Loop settings changes. Keep tracking for a few more days.';
    }

    if (score < 0.55) {
      return language === 'he'
        ? 'יש יותר מדי גורמי רעש (סטרס/מחלה/פעילות/סט). עדיף לדחות שינוי הגדרות ולעקוב שוב בעוד 2-3 ימים.'
        : 'There are too many confounders (stress/sickness/activity/set issue). Better postpone settings changes and reassess in 2-3 days.';
    }

    if (trend?.trendType === 'morning_high') {
      return language === 'he'
        ? 'נראה חוסר אינסולין עקבי בבוקר. אפשר לשקול התאמה עדינה של יעד/רגישות בחלון הבוקר בלבד, ואז לבדוק 3-5 ימים.'
        : 'A consistent morning insulin gap appears likely. Consider a gentle morning-only target/sensitivity adjustment, then monitor 3-5 days.';
    }

    if (trend?.trendType === 'overnight_low') {
      return language === 'he'
        ? 'נראה עודף אינסולין יחסי בלילה. אפשר לשקול התאמה עדינה בחלון הלילה בלבד, עם ניטור צמוד 3-5 ימים.'
        : 'Relative overnight insulin excess appears likely. Consider a gentle overnight-only adjustment with close 3-5 day monitoring.';
    }

    return language === 'he'
      ? 'נראה דפוס קבוע אחרי ארוחת צהריים. אפשר לשקול התאמת תזמון/הגדרה סביב חלון הצהריים בלבד, ואז לנטר 3-5 ימים.'
      : 'A recurring post-lunch pattern appears likely. Consider a lunch-window-only timing/setting adjustment and monitor 3-5 days.';
  }, [language, score, trend]);

  const disclaimer = language === 'he'
    ? 'גילוי נאות: זו תובנה אוטומטית תומכת החלטה בלבד, לא ייעוץ רפואי. לפני שינוי בהגדרות טיפול, מומלץ לעבור על ההמלצה עם הצוות הרפואי המטפל.'
    : 'Disclaimer: this is an automated decision-support insight, not medical advice. Before changing therapy settings, review with your treating clinical team.';

  return (
    <ScrollView style={{flex: 1, backgroundColor: '#f7f8fb'}} contentContainerStyle={{padding: 16, gap: 12}}>
      <View style={{padding: 14, borderRadius: 14, borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.25), backgroundColor: addOpacity(theme.accentColor, 0.08)}}>
        <Text style={{fontWeight: '900', color: theme.textColor, fontSize: 18}}>
          {language === 'he' ? 'סייע התאמת לופ אינטראקטיבי' : 'Interactive Loop Tuning Assist'}
        </Text>
        <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.8)}}>
          {language === 'he' ? (trend?.summaryHe ?? 'אנחנו בודקים יחד אם יש דפוס יציב שמצדיק שינוי.') : (trend?.summaryEn ?? 'We are checking together whether there is a stable pattern that justifies a change.')}
        </Text>
      </View>

      <OptionRow
        label={language === 'he' ? 'האם היית בלחץ משמעותי או חולה בימים האחרונים?' : 'Were you under major stress or sick in recent days?'}
        value={stressOrSick}
        onChange={setStressOrSick}
        theme={theme}
        language={language}
      />
      <OptionRow
        label={language === 'he' ? 'האם הייתה פעילות גופנית חריגה?' : 'Was there unusual exercise activity?'}
        value={specialExercise}
        onChange={setSpecialExercise}
        theme={theme}
        language={language}
      />
      <OptionRow
        label={language === 'he' ? 'האם סט המשאבה היה תקין?' : 'Was the pump set working properly?'}
        value={pumpSetOk}
        onChange={setPumpSetOk}
        theme={theme}
        language={language}
      />

      <View style={{marginTop: 6, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.16), backgroundColor: theme.white}}>
        <Text style={{fontWeight: '800', color: theme.textColor}}>{language === 'he' ? 'המלצה מסכמת' : 'Final recommendation'}</Text>
        <Text style={{marginTop: 8, color: theme.textColor}}>{recommendation}</Text>
        <Text style={{marginTop: 10, color: addOpacity(theme.textColor, 0.62), fontSize: 12}}>
          {language === 'he' ? `רמת ודאות לאחר שקלול הקשר: ${Math.round(score * 100)}%` : `Context-adjusted confidence: ${Math.round(score * 100)}%`}
        </Text>
      </View>

      <View style={{marginTop: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: addOpacity('#8d6e63', 0.28), backgroundColor: '#fff8f4'}}>
        <Text style={{fontWeight: '800', color: '#8d6e63'}}>{language === 'he' ? '⚠️ גילוי נאות' : '⚠️ Disclaimer'}</Text>
        <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.85)}}>{disclaimer}</Text>
      </View>
    </ScrollView>
  );
};

export default LoopAdjustmentAssistScreen;
