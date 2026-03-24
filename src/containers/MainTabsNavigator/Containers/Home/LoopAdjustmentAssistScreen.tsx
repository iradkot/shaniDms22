/* eslint-disable react-native/no-inline-styles */
import React, {useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, TextInput, View} from 'react-native';
import {subDays} from 'date-fns';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {createLlmProvider} from 'app/services/llm/llmClient';
import {sendJsonWithAdaptiveContext} from 'app/services/llm/robustJson';
import {
  fetchBgDataForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
  fetchDeviceStatusForDateRangeUncached,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {buildLoopAssistAiContext, LoopAssistContextPayload} from 'app/services/loopAssist/loopAssistDiagnostics';
import {buildLoopAssistSystemInstruction, buildLoopAssistTranslationInstruction} from 'app/services/loopAssist/loopAssistPrompts';

type YesNo = 'yes' | 'no' | null;

type LoopAiRecommendation = {
  setting_focus: 'carb_ratio' | 'isf' | 'target' | 'dia' | 'timing' | 'monitor_only';
  time_window: string;
  current_value: string;
  suggested_value: string;
  practical_instruction: string;
  rationale: string;
  confidence_pct: number;
  safety_note: string;
};

type OptionRowProps = {
  label: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
  details: string;
  onDetailsChange: (v: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  theme: ThemeType;
  language: string;
};

const OptionRow: React.FC<OptionRowProps> = ({
  label,
  value,
  onChange,
  details,
  onDetailsChange,
  expanded,
  onToggleExpanded,
  theme,
  language,
}) => (
  <View style={{marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.15), backgroundColor: theme.white}}>
    <Text style={{color: theme.textColor, fontWeight: '700'}}>{label}</Text>

    <View style={{marginTop: 8, flexDirection: 'row', gap: 8}}>
      <Pressable onPress={() => onChange('yes')} style={{paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: value === 'yes' ? theme.accentColor : addOpacity(theme.textColor, 0.2), backgroundColor: value === 'yes' ? addOpacity(theme.accentColor, 0.12) : 'transparent'}}>
        <Text style={{color: value === 'yes' ? theme.accentColor : theme.textColor, fontWeight: value === 'yes' ? '800' : '500'}}>{language === 'he' ? 'כן' : 'Yes'}</Text>
      </Pressable>
      <Pressable onPress={() => onChange('no')} style={{paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: value === 'no' ? theme.accentColor : addOpacity(theme.textColor, 0.2), backgroundColor: value === 'no' ? addOpacity(theme.accentColor, 0.12) : 'transparent'}}>
        <Text style={{color: value === 'no' ? theme.accentColor : theme.textColor, fontWeight: value === 'no' ? '800' : '500'}}>{language === 'he' ? 'לא' : 'No'}</Text>
      </Pressable>

      <Pressable onPress={onToggleExpanded} style={{paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.25), backgroundColor: expanded ? addOpacity(theme.textColor, 0.08) : 'transparent'}}>
        <Text style={{color: theme.textColor}}>{language === 'he' ? 'הרחב' : 'Expand'}</Text>
      </Pressable>
    </View>

    {expanded ? (
      <TextInput
        value={details}
        onChangeText={onDetailsChange}
        placeholder={language === 'he' ? 'הוסף עוד פרטים (אופציונלי)' : 'Add more details (optional)'}
        placeholderTextColor={addOpacity(theme.textColor, 0.45)}
        multiline
        style={{marginTop: 10, minHeight: 72, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.2), borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: theme.textColor, textAlignVertical: 'top'}}
      />
    ) : null}
  </View>
);

const LoopAdjustmentAssistScreen: React.FC<any> = ({route}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const {settings: aiSettings} = useAiSettings();

  const trend = route?.params?.trend ?? null;

  const [stressOrSick, setStressOrSick] = useState<YesNo>(null);
  const [specialExercise, setSpecialExercise] = useState<YesNo>(null);
  const [pumpSetOk, setPumpSetOk] = useState<YesNo>(null);

  const [stressExpanded, setStressExpanded] = useState(false);
  const [exerciseExpanded, setExerciseExpanded] = useState(false);
  const [pumpExpanded, setPumpExpanded] = useState(false);
  const [generalExpanded, setGeneralExpanded] = useState(false);

  const [stressDetails, setStressDetails] = useState('');
  const [exerciseDetails, setExerciseDetails] = useState('');
  const [pumpDetails, setPumpDetails] = useState('');
  const [generalDetails, setGeneralDetails] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<LoopAiRecommendation | null>(null);
  const [debugLog, setDebugLog] = useState<any | null>(null);

  const stressAnswered = stressOrSick !== null || stressDetails.trim().length > 0;
  const exerciseAnswered = specialExercise !== null || exerciseDetails.trim().length > 0;
  const pumpAnswered = pumpSetOk !== null || pumpDetails.trim().length > 0;

  const hasAtLeastOneAnswer = stressAnswered || exerciseAnswered || pumpAnswered || generalDetails.trim().length > 0;
  const allCoreAnswersProvided = stressAnswered && exerciseAnswered && pumpAnswered;

  const contextPayload = useMemo<LoopAssistContextPayload>(
    () => ({
      stressOrSick,
      specialExercise,
      pumpSetOk,
      stressDetails: stressDetails.trim(),
      exerciseDetails: exerciseDetails.trim(),
      pumpDetails: pumpDetails.trim(),
      generalDetails: generalDetails.trim(),
    }),
    [exerciseDetails, generalDetails, pumpDetails, pumpSetOk, specialExercise, stressDetails, stressOrSick],
  );

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

    if (stressDetails.trim().length > 30) s -= 0.04;
    if (exerciseDetails.trim().length > 30) s -= 0.04;
    if (pumpDetails.trim().length > 30) s -= 0.04;

    return Math.max(0, Math.min(1, s));
  }, [exerciseDetails, pumpDetails, pumpSetOk, specialExercise, stressDetails, stressOrSick, trend?.confidence]);

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

  const getSettingFocusLabel = (focus: LoopAiRecommendation['setting_focus']) => {
    if (language === 'he') {
      switch (focus) {
        case 'carb_ratio':
          return 'יחס פחמימות';
        case 'isf':
          return 'רגישות לאינסולין (ISF)';
        case 'target':
          return 'יעד סוכר';
        case 'dia':
          return 'משך פעילות אינסולין (DIA)';
        case 'timing':
          return 'תזמון';
        case 'monitor_only':
        default:
          return 'מעקב בלבד';
      }
    }

    switch (focus) {
      case 'carb_ratio':
        return 'Carb ratio';
      case 'isf':
        return 'Insulin sensitivity (ISF)';
      case 'target':
        return 'Glucose target';
      case 'dia':
        return 'Insulin duration (DIA)';
      case 'timing':
        return 'Timing';
      case 'monitor_only':
      default:
        return 'Monitor only';
    }
  };

  const parseJsonObject = (text: string): any | null => {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  const generateRecommendation = async () => {
    setSubmitAttempted(true);
    if (!allCoreAnswersProvided) {
      setSubmitted(false);
      return;
    }

    setSubmitted(false);
    setAiRecommendation(null);
    setIsGenerating(true);

    try {
      const end = new Date();
      const start = subDays(end, 7);
      const requestedBackgroundData: string[] = [];

      requestedBackgroundData.push('fetchBgDataForDateRangeUncached(7d)');
      requestedBackgroundData.push('fetchTreatmentsForDateRangeUncached(7d)');
      requestedBackgroundData.push('fetchDeviceStatusForDateRangeUncached(7d)');
      requestedBackgroundData.push('getUserProfileFromNightscout(today)');

      const [bgRows, treatments, deviceStatusRows, profile] = await Promise.all([
        fetchBgDataForDateRangeUncached(start, end, {throwOnError: false}),
        fetchTreatmentsForDateRangeUncached(start, end),
        fetchDeviceStatusForDateRangeUncached(start, end),
        getUserProfileFromNightscout(new Date().toISOString()).catch(() => null),
      ]);

      const {contextForAi} = buildLoopAssistAiContext({
        language,
        trend,
        clinicalQa: contextPayload,
        bgRows: bgRows as any[],
        treatments: treatments as any[],
        deviceStatusRows: deviceStatusRows as any[],
        profile,
      });

      const compactContextForAi = {
        ...contextForAi,
        samples: {
          bgFirst80: (contextForAi as any)?.samples?.bgFirst80?.slice?.(0, 20) ?? [],
          treatmentsFirst80: (contextForAi as any)?.samples?.treatmentsFirst80?.slice?.(0, 20) ?? [],
          deviceStatusFirst80: (contextForAi as any)?.samples?.deviceStatusFirst80?.slice?.(0, 20) ?? [],
        },
        profile: null,
      };

      const systemInstruction = buildLoopAssistSystemInstruction(language);

      const apiKey = (aiSettings.apiKey ?? '').trim();
      if (!aiSettings.enabled) {
        throw new Error(language === 'he' ? 'AI כבוי בהגדרות. יש להפעיל אותו בהגדרות AI.' : 'AI is disabled in settings. Please enable it in AI settings.');
      }
      if (!apiKey) {
        throw new Error(language === 'he' ? 'חסר OpenAI API key בהגדרות AI' : 'Missing OpenAI API key in AI settings');
      }

      const provider = createLlmProvider(aiSettings);
      const model = (aiSettings.openAiModel ?? 'gpt-5.4').trim() || 'gpt-5.4';

      const ultraCompactContextForAi = {
        ...compactContextForAi,
        samples: {
          bgFirst80: (compactContextForAi as any)?.samples?.bgFirst80?.slice?.(0, 8) ?? [],
          treatmentsFirst80: (compactContextForAi as any)?.samples?.treatmentsFirst80?.slice?.(0, 8) ?? [],
          deviceStatusFirst80: (compactContextForAi as any)?.samples?.deviceStatusFirst80?.slice?.(0, 8) ?? [],
        },
      };

      const adaptive = await sendJsonWithAdaptiveContext<LoopAiRecommendation>({
        provider,
        model,
        systemInstruction,
        temperature: 0.2,
        parse: raw => parseJsonObject(raw) as LoopAiRecommendation | null,
        contexts: [
          {name: 'full', payload: contextForAi, maxOutputTokens: 900},
          {name: 'compact', payload: compactContextForAi, maxOutputTokens: 1200},
          {name: 'ultra-compact', payload: ultraCompactContextForAi, maxOutputTokens: 1400},
        ],
      });

      const rawResponse = adaptive.raw;
      const parsed = adaptive.parsed;
      const usedCompactContext = adaptive.usedContextName !== 'full';

      let normalized = parsed;
      const needsHebrewNormalization =
        language === 'he' && /[A-Za-z]{3,}/.test(String(parsed?.practical_instruction ?? ''));

      if (needsHebrewNormalization) {
        const translateInstruction = buildLoopAssistTranslationInstruction();

        const trRes = await provider.sendChat({
          model,
          messages: [
            {role: 'system', content: translateInstruction},
            {role: 'user', content: JSON.stringify(parsed)},
          ],
          temperature: 0,
          maxOutputTokens: 420,
        });

        const translated = parseJsonObject(String(trRes?.content ?? '').trim()) as LoopAiRecommendation | null;
        if (translated) {
          normalized = translated;
        }
      }

      setAiRecommendation(normalized);
      setSubmitted(true);
      const contextByName: Record<string, unknown> = {
        full: contextForAi,
        compact: compactContextForAi,
        'ultra-compact': ultraCompactContextForAi,
      };
      setDebugLog({
        createdAt: new Date().toISOString(),
        appScreen: 'LoopAdjustmentAssistScreen',
        model,
        requestedBackgroundData,
        systemInstruction,
        usedCompactContext,
        usedContextName: adaptive.usedContextName,
        adaptiveTraces: adaptive.traces,
        contextSent: contextByName[adaptive.usedContextName] ?? contextForAi,
        aiRawResponse: rawResponse,
        aiParsedResponse: normalized,
      });
    } catch (e: any) {
      setSubmitted(false);
      Alert.alert(language === 'he' ? 'שגיאה' : 'Error', String(e?.message ?? e));
    } finally {
      setIsGenerating(false);
    }
  };

  const exportDebugLog = async () => {
    if (!debugLog) {
      Alert.alert(language === 'he' ? 'עדיין אין לוג' : 'No logs yet');
      return;
    }

    const payload = JSON.stringify(debugLog, null, 2);
    await Share.share({
      title: language === 'he' ? 'ייצוא לוג התאמת לופ' : 'Export loop assist logs',
      message: payload,
    });
  };

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
        details={stressDetails}
        onDetailsChange={setStressDetails}
        expanded={stressExpanded}
        onToggleExpanded={() => setStressExpanded(prev => !prev)}
        theme={theme}
        language={language}
      />
      <OptionRow
        label={language === 'he' ? 'האם הייתה פעילות גופנית חריגה?' : 'Was there unusual exercise activity?'}
        value={specialExercise}
        onChange={setSpecialExercise}
        details={exerciseDetails}
        onDetailsChange={setExerciseDetails}
        expanded={exerciseExpanded}
        onToggleExpanded={() => setExerciseExpanded(prev => !prev)}
        theme={theme}
        language={language}
      />
      <OptionRow
        label={language === 'he' ? 'האם סט המשאבה היה תקין?' : 'Was the pump set working properly?'}
        value={pumpSetOk}
        onChange={setPumpSetOk}
        details={pumpDetails}
        onDetailsChange={setPumpDetails}
        expanded={pumpExpanded}
        onToggleExpanded={() => setPumpExpanded(prev => !prev)}
        theme={theme}
        language={language}
      />

      <View style={{marginTop: 2, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.15), backgroundColor: theme.white}}>
        <Pressable onPress={() => setGeneralExpanded(prev => !prev)} style={{paddingVertical: 2}}>
          <Text style={{fontWeight: '700', color: theme.textColor}}>{language === 'he' ? 'הרחב כללי' : 'General expand'}</Text>
        </Pressable>
        {generalExpanded ? (
          <TextInput
            value={generalDetails}
            onChangeText={setGeneralDetails}
            placeholder={language === 'he' ? 'עוד מידע חשוב שתרצה/י להוסיף' : 'Any extra context you want to add'}
            placeholderTextColor={addOpacity(theme.textColor, 0.45)}
            multiline
            style={{marginTop: 8, minHeight: 80, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.2), borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: theme.textColor, textAlignVertical: 'top'}}
          />
        ) : null}
      </View>

      {!hasAtLeastOneAnswer ? (
        <Text style={{color: addOpacity(theme.textColor, 0.6), fontSize: 12}}>
          {language === 'he' ? 'התחל/י במענה על השאלות, ואז נפיק המלצה מותאמת.' : 'Start by answering the questions, then we will generate a tailored recommendation.'}
        </Text>
      ) : null}

      <Pressable
        onPress={generateRecommendation}
        disabled={isGenerating}
        style={{
          marginTop: 4,
          alignSelf: 'flex-start',
          paddingVertical: 9,
          paddingHorizontal: 14,
          borderRadius: 10,
          backgroundColor: allCoreAnswersProvided ? theme.accentColor : addOpacity(theme.accentColor, 0.45),
          opacity: isGenerating ? 0.75 : 1,
        }}
      >
        <Text style={{color: theme.white, fontWeight: '800'}}>{language === 'he' ? 'קבל המלצה' : 'Get recommendation'}</Text>
      </Pressable>

      {isGenerating ? (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <ActivityIndicator size="small" color={theme.accentColor} />
          <Text style={{color: addOpacity(theme.textColor, 0.75)}}>
            {language === 'he' ? 'מחשב המלצה בעזרת AI ומושך נתונים נוספים...' : 'Computing AI recommendation and fetching additional data...'}
          </Text>
        </View>
      ) : null}

      {submitAttempted && !allCoreAnswersProvided ? (
        <Text style={{color: '#8d6e63', fontSize: 12}}>
          {language === 'he'
            ? 'כדי לקבל המלצה, צריך להשלים מענה בכל 3 השאלות (כן/לא או פירוט בהרחבה).'
            : 'To get a recommendation, complete all 3 core questions (Yes/No or expanded details).'}
        </Text>
      ) : null}

      {submitted ? (
        <View style={{marginTop: 6, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.16), backgroundColor: theme.white}}>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{language === 'he' ? 'המלצה מסכמת' : 'Final recommendation'}</Text>

          <View style={{marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: addOpacity(theme.accentColor, 0.22), backgroundColor: addOpacity(theme.accentColor, 0.06)}}>
            <Text style={{fontWeight: '800', color: theme.textColor}}>
              {language === 'he' ? 'מה הגוף שלך עובר' : 'What your body is going through'}
            </Text>
            <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.86)}}>
              {aiRecommendation?.rationale || recommendation}
            </Text>
          </View>

          <View style={{marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.18), backgroundColor: theme.white}}>
            <Text style={{fontWeight: '800', color: theme.textColor}}>
              {language === 'he' ? 'הפעולה המומלצת' : 'Recommended action'}
            </Text>

            <Text style={{marginTop: 6, color: theme.textColor}}>
              {aiRecommendation?.practical_instruction || recommendation}
            </Text>

            {aiRecommendation ? (
              <>
                <Text style={{marginTop: 8, color: addOpacity(theme.textColor, 0.82)}}>
                  {language === 'he'
                    ? `פוקוס הגדרה: ${getSettingFocusLabel(aiRecommendation.setting_focus)} | חלון זמן: ${aiRecommendation.time_window}`
                    : `Setting focus: ${getSettingFocusLabel(aiRecommendation.setting_focus)} | Time window: ${aiRecommendation.time_window}`}
                </Text>
                <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.82)}}>
                  {language === 'he'
                    ? `נוכחי: ${aiRecommendation.current_value} → מוצע: ${aiRecommendation.suggested_value}`
                    : `Current: ${aiRecommendation.current_value} → Suggested: ${aiRecommendation.suggested_value}`}
                </Text>
                <Text style={{marginTop: 4, color: addOpacity(theme.textColor, 0.7), fontSize: 12}}>
                  {language === 'he' ? `ודאות AI: ${Math.round(Number(aiRecommendation.confidence_pct ?? 0))}%` : `AI confidence: ${Math.round(Number(aiRecommendation.confidence_pct ?? 0))}%`}
                </Text>
              </>
            ) : null}
          </View>

          {aiRecommendation?.safety_note ? (
            <Text style={{marginTop: 8, color: '#8d6e63', fontSize: 12}}>{aiRecommendation.safety_note}</Text>
          ) : null}

          {(contextPayload.stressDetails || contextPayload.exerciseDetails || contextPayload.pumpDetails || contextPayload.generalDetails) ? (
            <Text style={{marginTop: 10, color: addOpacity(theme.textColor, 0.7), fontSize: 12}}>
              {language === 'he' ? 'שילבנו גם את ההרחבות שהוספת כדי לשפר את הרלוונטיות של ההמלצה.' : 'We also incorporated your added details to improve recommendation relevance.'}
            </Text>
          ) : null}

          <Text style={{marginTop: 10, color: addOpacity(theme.textColor, 0.62), fontSize: 12}}>
            {language === 'he'
              ? `תשובות שסוכמו: לחץ/מחלה=${contextPayload.stressOrSick ?? '-'}, פעילות חריגה=${contextPayload.specialExercise ?? '-'}, סט תקין=${contextPayload.pumpSetOk ?? '-'}`
              : `Captured answers: stress/sick=${contextPayload.stressOrSick ?? '-'}, unusual exercise=${contextPayload.specialExercise ?? '-'}, set OK=${contextPayload.pumpSetOk ?? '-'}`}
          </Text>

          <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.62), fontSize: 12}}>
            {language === 'he' ? `רמת ודאות לאחר שקלול הקשר: ${Math.round(score * 100)}%` : `Context-adjusted confidence: ${Math.round(score * 100)}%`}
          </Text>

          <Pressable onPress={exportDebugLog} style={{marginTop: 10, alignSelf: 'flex-start'}}>
            <Text style={{color: theme.accentColor, fontWeight: '700'}}>
              {language === 'he' ? 'הורד לוגים מלאים של ההמלצה' : 'Download full recommendation logs'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{marginTop: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: addOpacity('#8d6e63', 0.28), backgroundColor: '#fff8f4'}}>
        <Text style={{fontWeight: '800', color: '#8d6e63'}}>{language === 'he' ? '⚠️ גילוי נאות' : '⚠️ Disclaimer'}</Text>
        <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.85)}}>{disclaimer}</Text>
      </View>
    </ScrollView>
  );
};

export default LoopAdjustmentAssistScreen;
