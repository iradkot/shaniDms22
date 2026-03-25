/* eslint-disable react-native/no-inline-styles */
import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, TextInput, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {AndroidImportance} from '@notifee/react-native';
import {subDays} from 'date-fns';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {createLlmProvider} from 'app/services/llm/llmClient';
import {sendJsonWithAdaptiveContext} from 'app/services/llm/robustJson';
import {collectPagedTextFromLlm} from 'app/services/llm/pagingProtocol';
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

const LOOP_ASSIST_LAST_RESULT_KEY = 'loopAssist:lastRecommendation:v1';
const LOOP_ASSIST_LAST_ERROR_KEY = 'loopAssist:lastError:v1';
const LOOP_ASSIST_STATUS_KEY = 'loopAssist:status:v1';
const LOOP_ASSIST_NOTIFICATION_CHANNEL = 'loop-assist-ready';

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
  const [generationStage, setGenerationStage] = useState<string | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<LoopAiRecommendation | null>(null);
  const [debugLog, setDebugLog] = useState<any | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [persistedStatus, setPersistedStatus] = useState<{status: 'running' | 'ready' | 'failed'; startedAt?: string; readyAt?: string; failedAt?: string; errorMessage?: string} | null>(
    route?.params?.status ?? null,
  );
  const [persistedErrorLog, setPersistedErrorLog] = useState<any | null>(null);

  const stressAnswered = stressOrSick !== null || stressDetails.trim().length > 0;
  const exerciseAnswered = specialExercise !== null || exerciseDetails.trim().length > 0;
  const pumpAnswered = pumpSetOk !== null || pumpDetails.trim().length > 0;

  const hasAtLeastOneAnswer = stressAnswered || exerciseAnswered || pumpAnswered || generalDetails.trim().length > 0;
  const allCoreAnswersProvided = stressAnswered && exerciseAnswered && pumpAnswered;

  useEffect(() => {
    let alive = true;

    const loadPersisted = async () => {
      try {
        const [rawResult, rawStatus, rawError] = await Promise.all([
          AsyncStorage.getItem(LOOP_ASSIST_LAST_RESULT_KEY),
          AsyncStorage.getItem(LOOP_ASSIST_STATUS_KEY),
          AsyncStorage.getItem(LOOP_ASSIST_LAST_ERROR_KEY),
        ]);
        if (!alive) {
          return;
        }

        if (rawResult) {
          const parsed = JSON.parse(rawResult) as {savedAt?: string; recommendation?: LoopAiRecommendation; debugLog?: any};
          if (parsed?.recommendation) {
            setAiRecommendation(parsed.recommendation);
            setSubmitted(true);
            if (parsed.debugLog) {
              setDebugLog(parsed.debugLog);
            }
            if (parsed.savedAt) {
              setLastSavedAt(parsed.savedAt);
            }
          }
        }

        if (rawStatus) {
          const parsedStatus = JSON.parse(rawStatus);
          if (parsedStatus?.status === 'running' || parsedStatus?.status === 'ready' || parsedStatus?.status === 'failed') {
            setPersistedStatus(parsedStatus);
          }
        }

        if (rawError) {
          const parsedError = JSON.parse(rawError);
          setPersistedErrorLog(parsedError);
          if (!submitted) {
            setDebugLog(parsedError);
          }
        }
      } catch {
        // ignore storage parse/read failures
      }
    };

    loadPersisted();
    const interval = setInterval(loadPersisted, 5000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [submitted]);

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

  const hasFalseMissingSettingsClaim = (rec: LoopAiRecommendation, aiContext: any): boolean => {
    const p = aiContext?.loopSettingsProfile;
    const hasCarbRatio = Number.isFinite(Number(p?.around22_00?.carbRatio));
    const hasISF = Number.isFinite(Number(p?.around04_00?.isf));
    const hasTargets =
      Number.isFinite(Number(p?.around22_00?.targetLow)) ||
      Number.isFinite(Number(p?.around22_00?.targetHigh)) ||
      Number.isFinite(Number(p?.around04_00?.targetLow)) ||
      Number.isFinite(Number(p?.around04_00?.targetHigh));

    const combined = `${rec?.practical_instruction ?? ''} ${rec?.rationale ?? ''} ${rec?.current_value ?? ''}`.toLowerCase();
    const missingClaim =
      /not\s+provided|missing|not\s+available|חסר|לא\s+סופק|לא\s+זמין/.test(combined) &&
      /(carb\s*ratio|cr\b|יחס\s*פחמ|isf|sensitivity|target|יעד)/.test(combined);

    return Boolean(missingClaim && (hasCarbRatio || hasISF || hasTargets));
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
    setGenerationStage(language === 'he' ? 'מתחיל חישוב...' : 'Starting analysis...');
    const runningStatus = {status: 'running' as const, startedAt: new Date().toISOString()};
    setPersistedStatus(runningStatus);
    await AsyncStorage.setItem(LOOP_ASSIST_STATUS_KEY, JSON.stringify(runningStatus));

    const runLog: any = {
      createdAt: new Date().toISOString(),
      appScreen: 'LoopAdjustmentAssistScreen',
      stages: [] as Array<{at: string; stage: string}>,
    };
    const markStage = (stage: string) => {
      setGenerationStage(stage);
      runLog.stages.push({at: new Date().toISOString(), stage});
    };

    try {
      const end = new Date();
      const start = subDays(end, 7);
      const requestedBackgroundData: string[] = [];

      requestedBackgroundData.push('fetchBgDataForDateRangeUncached(7d)');
      requestedBackgroundData.push('fetchTreatmentsForDateRangeUncached(7d)');
      requestedBackgroundData.push('fetchDeviceStatusForDateRangeUncached(7d)');
      requestedBackgroundData.push('getUserProfileFromNightscout(today)');

      markStage(language === 'he' ? 'מושך נתוני רקע מהשרת...' : 'Fetching background data...');
      const [bgRows, treatments, deviceStatusRows, profile] = await Promise.all([
        fetchBgDataForDateRangeUncached(start, end, {throwOnError: false}),
        fetchTreatmentsForDateRangeUncached(start, end),
        fetchDeviceStatusForDateRangeUncached(start, end),
        getUserProfileFromNightscout(new Date().toISOString()).catch(() => null),
      ]);

      const bgCount = Array.isArray(bgRows) ? bgRows.length : 0;
      const txCount = Array.isArray(treatments) ? treatments.length : 0;
      const dsCount = Array.isArray(deviceStatusRows) ? deviceStatusRows.length : 0;
      if (bgCount < 72 || txCount < 3 || dsCount < 24) {
        throw new Error(
          language === 'he'
            ? 'אין מספיק נתונים איכותיים ליצירת המלצת לופ בטוחה. נסה שוב בעוד זמן קצר לאחר סנכרון נוסף.'
            : 'Insufficient high-quality data for a safe Loop settings recommendation. Please retry after more sync data is available.',
        );
      }

      markStage(language === 'he' ? 'בונה קונטקסט קליני ל-AI...' : 'Building clinical AI context...');
      const {contextForAi} = buildLoopAssistAiContext({
        language,
        trend,
        clinicalQa: contextPayload,
        bgRows: bgRows as any[],
        treatments: treatments as any[],
        deviceStatusRows: deviceStatusRows as any[],
        profile,
      });

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

      const analysisInstruction = [
        'Create a comprehensive clinical reasoning memo from the payload.',
        'Cover evidence weighing, confounders, contradiction checks, and safety risks.',
        'Include why alternatives were rejected.',
        'Do not output final patient recommendation here; this is internal analysis memo only.',
      ].join(' ');

      markStage(language === 'he' ? 'מבצע ניתוח קליני עמוק (בכמה חלקים)...' : 'Running deep clinical analysis (paged)...');

      const compactAnalysisPayload = {
        language: (contextForAi as any).language,
        trend: (contextForAi as any).trend,
        clinicalQa: (contextForAi as any).clinicalQa,
        dataSummary: (contextForAi as any).dataSummary,
        loopDiagnostics: (contextForAi as any).loopDiagnostics,
      };

      let analysisPaged;
      try {
        analysisPaged = await collectPagedTextFromLlm({
          provider,
          model,
          baseSystemInstruction: analysisInstruction,
          payload: contextForAi,
          maxPages: 6,
          maxOutputTokensPerPage: 1200,
          maxAttemptsPerPage: 3,
          pageCharTarget: 1500,
          temperature: 0.2,
        });
      } catch (e: any) {
        runLog.pagingPrimaryError = String(e?.message ?? e);
        if (Array.isArray(e?.pagingTraces)) {
          runLog.pagingPrimaryTraces = e.pagingTraces;
        }
        markStage(language === 'he' ? 'ניתוח מלא נכשל, מנסה ניתוח קומפקטי...' : 'Full analysis failed, retrying compact analysis...');
        analysisPaged = await collectPagedTextFromLlm({
          provider,
          model,
          baseSystemInstruction: analysisInstruction,
          payload: compactAnalysisPayload,
          maxPages: 5,
          maxOutputTokensPerPage: 1400,
          maxAttemptsPerPage: 4,
          pageCharTarget: 1100,
          temperature: 0.2,
        });
        runLog.pagingUsedCompactAnalysisPayload = true;
      }

      if (analysisPaged.truncated) {
        throw new Error(
          language === 'he'
            ? 'הניתוח הקליני הפנימי נקטע לפני סיום. לא נציג המלצה חלקית.'
            : 'Internal clinical analysis was truncated before completion. No partial recommendation will be shown.',
        );
      }

      const finalDecisionPayload = {
        context: contextForAi,
        internal_analysis_memo: analysisPaged.text,
        output_contract: {
          keys: [
            'setting_focus',
            'time_window',
            'current_value',
            'suggested_value',
            'practical_instruction',
            'rationale',
            'confidence_pct',
            'safety_note',
          ],
          keep_patient_text_clear_and_concise: true,
        },
      };

      markStage(language === 'he' ? 'מפיק החלטה סופית מדויקת...' : 'Producing final decision...');
      const adaptive = await sendJsonWithAdaptiveContext<LoopAiRecommendation>({
        provider,
        model,
        systemInstruction,
        temperature: 0.2,
        parse: raw => parseJsonObject(raw) as LoopAiRecommendation | null,
        contexts: [
          {name: 'full-final-pass', payload: finalDecisionPayload, maxOutputTokens: 1000},
          {name: 'full-final-pass-retry', payload: finalDecisionPayload, maxOutputTokens: 1400},
        ],
      });

      let rawResponse = adaptive.raw;
      let parsed = adaptive.parsed;
      const usedCompactContext = false;

      // One-shot self-check: if model claims settings are missing while context contains them,
      // force a corrective re-run with explicit evidence.
      const selfCheckTriggered = hasFalseMissingSettingsClaim(parsed, contextForAi);
      runLog.selfCheckTriggered = selfCheckTriggered;
      if (selfCheckTriggered) {
        markStage(language === 'he' ? 'מבצע בדיקת עקביות פנימית של ההמלצה...' : 'Running internal recommendation consistency self-check...');
        const evidencePayload = {
          ...finalDecisionPayload,
          self_check: {
            reason: 'Model stated settings are missing although payload includes loop settings profile values.',
            must_use_settings_snapshot: (contextForAi as any)?.loopSettingsProfile ?? null,
            instruction:
              'Recompute recommendation using available loopSettingsProfile fields and do not claim missing settings unless specific field is null.',
          },
        };

        const selfCheckAdaptive = await sendJsonWithAdaptiveContext<LoopAiRecommendation>({
          provider,
          model,
          systemInstruction,
          temperature: 0.2,
          parse: raw => parseJsonObject(raw) as LoopAiRecommendation | null,
          contexts: [
            {name: 'self-check-pass', payload: evidencePayload, maxOutputTokens: 1100},
            {name: 'self-check-pass-retry', payload: evidencePayload, maxOutputTokens: 1500},
          ],
        });

        rawResponse = selfCheckAdaptive.raw;
        parsed = selfCheckAdaptive.parsed;
        runLog.selfCheckAdaptiveTraces = selfCheckAdaptive.traces;
      }

      let normalized = parsed;
      const needsHebrewNormalization =
        language === 'he' && /[A-Za-z]{3,}/.test(String(parsed?.practical_instruction ?? ''));

      if (needsHebrewNormalization) {
        markStage(language === 'he' ? 'מיישר שפה לעברית...' : 'Normalizing output language...');
        const translateInstruction = buildLoopAssistTranslationInstruction();

        const trAdaptive = await sendJsonWithAdaptiveContext<LoopAiRecommendation>({
          provider,
          model,
          systemInstruction: translateInstruction,
          temperature: 0,
          parse: raw => parseJsonObject(raw) as LoopAiRecommendation | null,
          contexts: [
            {name: 'translate-pass', payload: parsed, maxOutputTokens: 500},
            {name: 'translate-pass-retry', payload: parsed, maxOutputTokens: 900},
          ],
        });

        normalized = trAdaptive.parsed;
        runLog.translationAdaptiveTraces = trAdaptive.traces;
      }

      setAiRecommendation(normalized);
      setSubmitted(true);
      markStage(language === 'he' ? 'ההמלצה מוכנה ✅' : 'Recommendation ready ✅');
      const finalLog = {
        ...runLog,
        model,
        requestedBackgroundData,
        systemInstruction,
        usedCompactContext,
        usedContextName: runLog.selfCheckTriggered ? 'self-check-pass' : adaptive.usedContextName,
        adaptiveTraces: adaptive.traces,
        pagingAnalysis: {
          pagesUsed: analysisPaged.pagesUsed,
          truncated: analysisPaged.truncated,
          traces: analysisPaged.traces,
          analysisChars: analysisPaged.text.length,
        },
        contextSent: finalDecisionPayload,
        aiRawResponse: rawResponse,
        aiParsedResponse: normalized,
      };
      setDebugLog(finalLog);

      const savedAt = new Date().toISOString();
      setLastSavedAt(savedAt);
      await AsyncStorage.setItem(
        LOOP_ASSIST_LAST_RESULT_KEY,
        JSON.stringify({savedAt, recommendation: normalized, debugLog: finalLog}),
      );
      await AsyncStorage.removeItem(LOOP_ASSIST_LAST_ERROR_KEY);
      const readyStatus = {status: 'ready' as const, readyAt: savedAt};
      setPersistedStatus(readyStatus);
      await AsyncStorage.setItem(LOOP_ASSIST_STATUS_KEY, JSON.stringify(readyStatus));

      const channelId = await notifee.createChannel({
        id: LOOP_ASSIST_NOTIFICATION_CHANNEL,
        name: language === 'he' ? 'המלצת לופ מוכנה' : 'Loop recommendation ready',
        importance: AndroidImportance.HIGH,
      });
      await notifee.displayNotification({
        title: language === 'he' ? 'המלצת התאמת לופ מוכנה' : 'Loop adjustment recommendation is ready',
        body: language === 'he' ? 'אפשר לפתוח את המסך ולראות את ההמלצה השמורה.' : 'Open the screen to view the saved recommendation.',
        android: {channelId, pressAction: {id: 'default'}},
      });
    } catch (e: any) {
      setSubmitted(false);
      const errMsg = String(e?.message ?? e);
      const errorLog = {
        ...runLog,
        failed: true,
        errorMessage: errMsg,
      };
      setDebugLog(errorLog);
      setPersistedErrorLog(errorLog);
      await AsyncStorage.setItem(LOOP_ASSIST_LAST_ERROR_KEY, JSON.stringify(errorLog));
      const failedStatus = {status: 'failed' as const, failedAt: new Date().toISOString(), errorMessage: errMsg};
      setPersistedStatus(failedStatus);
      await AsyncStorage.setItem(LOOP_ASSIST_STATUS_KEY, JSON.stringify(failedStatus));
      Alert.alert(language === 'he' ? 'שגיאה' : 'Error', errMsg);
    } finally {
      setIsGenerating(false);
      setGenerationStage(null);
    }
  };

  const exportDebugLog = async () => {
    const candidateLog = debugLog ?? persistedErrorLog;
    if (!candidateLog) {
      Alert.alert(language === 'he' ? 'עדיין אין לוג' : 'No logs yet');
      return;
    }

    const payload = JSON.stringify(candidateLog, null, 2);
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

      <View style={{padding: 12, borderRadius: 12, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.18), backgroundColor: theme.white}}>
        <Text style={{fontWeight: '800', color: theme.textColor}}>
          {language === 'he' ? 'סטטוס ריצה אחרונה' : 'Latest run status'}
        </Text>
        <Text style={{marginTop: 6, color: addOpacity(theme.textColor, 0.78)}}>
          {!persistedStatus
            ? (language === 'he' ? 'עדיין אין ריצה שמורה. אפשר להתחיל ריצה חדשה מכפתור "קבל המלצה".' : 'No persisted run yet. Start a new run using "Get recommendation".')
            : persistedStatus.status === 'running'
            ? (language === 'he' ? 'בהכנה: ניתוח רץ ברקע. אפשר לחזור למסך הבית ונודיע כשהכול מוכן.' : 'Running in background. You can leave this screen and we will notify when ready.')
            : persistedStatus.status === 'ready'
            ? (language === 'he' ? 'מוכן: נמצאה המלצה ונשמרה על המכשיר.' : 'Ready: recommendation is available and saved on device.')
            : (language === 'he' ? 'נכשל: הריצה האחרונה נכשלה. אפשר להוריד לוג שגיאה מלא.' : 'Failed: last run failed. You can download a full error log.')}
        </Text>
        {(persistedStatus?.status === 'failed' || persistedErrorLog || debugLog?.failed) ? (
          <Pressable onPress={exportDebugLog} style={{marginTop: 8, alignSelf: 'flex-start'}}>
            <Text style={{color: theme.accentColor, fontWeight: '700'}}>
              {language === 'he' ? 'הורד לוג שגיאה מלא' : 'Download full error log'}
            </Text>
          </Pressable>
        ) : null}
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
        <View style={{gap: 6}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <ActivityIndicator size="small" color={theme.accentColor} />
            <Text style={{color: addOpacity(theme.textColor, 0.75)}}>
              {generationStage || (language === 'he' ? 'מחשב המלצה בעזרת AI ומושך נתונים נוספים...' : 'Computing AI recommendation and fetching additional data...')}
            </Text>
          </View>
          <Text style={{color: addOpacity(theme.textColor, 0.62), fontSize: 12}}>
            {language === 'he'
              ? 'אפשר לעבור למסך אחר — נשלח התראה כשההמלצה תהיה מוכנה ונשמור אותה במכשיר.'
              : 'You can leave this screen — we will notify you when ready and save the recommendation on device.'}
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

      {!isGenerating && !submitted && debugLog?.failed ? (
        <Pressable onPress={exportDebugLog} style={{alignSelf: 'flex-start'}}>
          <Text style={{color: theme.accentColor, fontWeight: '700'}}>
            {language === 'he' ? 'הורד לוג שגיאה מלא' : 'Download full error log'}
          </Text>
        </Pressable>
      ) : null}

      {lastSavedAt ? (
        <Text style={{color: addOpacity(theme.textColor, 0.6), fontSize: 12}}>
          {language === 'he' ? `המלצה אחרונה נשמרה במכשיר: ${new Date(lastSavedAt).toLocaleString()}` : `Last recommendation saved on device: ${new Date(lastSavedAt).toLocaleString()}`}
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
              {aiRecommendation?.rationale}
            </Text>
          </View>

          <View style={{marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: addOpacity(theme.textColor, 0.18), backgroundColor: theme.white}}>
            <Text style={{fontWeight: '800', color: theme.textColor}}>
              {language === 'he' ? 'הפעולה המומלצת' : 'Recommended action'}
            </Text>

            <Text style={{marginTop: 6, color: theme.textColor}}>
              {aiRecommendation?.practical_instruction}
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
