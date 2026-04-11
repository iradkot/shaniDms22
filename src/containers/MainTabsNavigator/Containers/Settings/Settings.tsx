import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {theme} from 'app/style/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {useTabsSettings} from 'app/contexts/TabsSettingsContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {useNightscoutConfig} from 'app/contexts/NightscoutConfigContext';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {useProactiveCareSettings} from 'app/contexts/ProactiveCareSettingsContext';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ADIcon from 'react-native-vector-icons/AntDesign';
import {useNavigation} from '@react-navigation/native';
import {NIGHTSCOUT_SETUP_SCREEN} from 'app/constants/SCREEN_NAMES';
import {validateOpenAiApiKey} from 'app/services/llm/providers/openaiProvider';
import {sendDailyBriefNow} from 'app/services/proactiveCare/dailyBrief';
import {clearAllMemory, getMemoryStats} from 'app/services/aiMemory/aiMemoryStore';
import {NightscoutSection} from './sections/NightscoutSection';
import {iconContainerStyle, labelStyle, rowStyle, SectionHeader} from './settingsShared';
import {t as tr} from 'app/i18n/translations';
import {addOpacity} from 'app/style/styling.utils';
import {setAndroidWidgetLiveModeEnabled} from 'app/services/androidGlucoseLiveSurface';

const UI_STORAGE_KEY = 'settings.ui.v1';
const WIDGET_STORAGE_KEY = 'settings.widget.v1';

const Settings: React.FC = () => {
  const navigation = useNavigation<any>();
  const {settings, setSetting} = useTabsSettings();
  const {settings: glucoseSettings, setSetting: setGlucoseSetting, isLoaded: glucoseLoaded} =
    useGlucoseSettings();
  const {profiles, activeProfile, setActiveProfileId, deleteProfile} = useNightscoutConfig();
  const {settings: aiSettings, setSetting: setAiSetting, isLoaded: aiLoaded} = useAiSettings();
  const {settings: proactiveSettings, setSetting: setProactiveSetting} = useProactiveCareSettings();
  const {language, setLanguage} = useAppLanguage();

  const [showDisplayedTabs, setShowDisplayedTabs] = useState(true);
  const [showNightscout, setShowNightscout] = useState(false);
  const [showRanges, setShowRanges] = useState(false);
  const [showNightWindow, setShowNightWindow] = useState(false);
  const [showMealWindows, setShowMealWindows] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showProactiveCare, setShowProactiveCare] = useState(false);
  const [uiLoaded, setUiLoaded] = useState(false);
  const [memoryStats, setMemoryStats] = useState<{total: number; byType: {profile: number; episode: number; chat_summary: number}; latestUpdatedAt: number | null} | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);

  const [aiApiKeyText, setAiApiKeyText] = useState('');
  const [aiModelText, setAiModelText] = useState('');
  const [aiModelPreset, setAiModelPreset] = useState<string>('gpt-5.4');
  const [aiKeyStatus, setAiKeyStatus] = useState<
    | {state: 'idle'}
    | {state: 'checking'}
    | {state: 'valid'; message: string}
    | {state: 'invalid'; message: string}
    | {state: 'error'; message: string}
  >({state: 'idle'});

  const [severeHypoText, setSevereHypoText] = useState('');
  const [hypoText, setHypoText] = useState('');
  const [hyperText, setHyperText] = useState('');
  const [severeHyperText, setSevereHyperText] = useState('');
  const [nightStartText, setNightStartText] = useState('');
  const [nightEndText, setNightEndText] = useState('');
  const [breakfastStartText, setBreakfastStartText] = useState('');
  const [lunchStartText, setLunchStartText] = useState('');
  const [dinnerStartText, setDinnerStartText] = useState('');
  const [dailyBriefHourText, setDailyBriefHourText] = useState('08');
  const [dailyBriefMinuteText, setDailyBriefMinuteText] = useState('00');
  const [dailyBriefStatus, setDailyBriefStatus] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [androidLiveMode, setAndroidLiveMode] = useState(true);

  const openAiModelOptions = useMemo(
    () => [
      {id: 'gpt-5.4', label: 'gpt-5.4 (latest default)'} as const,
      {id: 'gpt-4o-mini', label: 'gpt-4o-mini (fast + cheap)'} as const,
      {id: 'gpt-4o', label: 'gpt-4o (best general)'} as const,
      {id: 'gpt-4.1-mini', label: 'gpt-4.1-mini (strong + efficient)'} as const,
      {id: 'gpt-4.1', label: 'gpt-4.1 (strongest reasoning)'} as const,
      {id: 'o3-mini', label: 'o3-mini (reasoning, budget)'} as const,
    ],
    [],
  );

  useEffect(() => {
    if (!glucoseLoaded) return;
    setSevereHypoText(String(glucoseSettings.severeHypo));
    setHypoText(String(glucoseSettings.hypo));
    setHyperText(String(glucoseSettings.hyper));
    setSevereHyperText(String(glucoseSettings.severeHyper));
    setNightStartText(String(glucoseSettings.nightStartHour));
    setNightEndText(String(glucoseSettings.nightEndHour));
    setBreakfastStartText(String(glucoseSettings.breakfastStartHour));
    setLunchStartText(String(glucoseSettings.lunchStartHour));
    setDinnerStartText(String(glucoseSettings.dinnerStartHour));
  }, [glucoseLoaded, glucoseSettings]);

  useEffect(() => {
    setDailyBriefHourText(String(proactiveSettings.dailyBrief.hour).padStart(2, '0'));
    setDailyBriefMinuteText(String(proactiveSettings.dailyBrief.minute).padStart(2, '0'));
  }, [proactiveSettings.dailyBrief.hour, proactiveSettings.dailyBrief.minute]);

  useEffect(() => {
    if (!aiLoaded) return;

    setAiApiKeyText(aiSettings.apiKey || '');

    const storedModel = (aiSettings.openAiModel || '').trim();
    const presetIds = new Set(openAiModelOptions.map(o => o.id));

    if (storedModel && presetIds.has(storedModel as any)) {
      setAiModelPreset(storedModel);
      setAiModelText(storedModel);
      return;
    }

    if (storedModel) {
      setAiModelPreset('custom');
      setAiModelText(storedModel);
      return;
    }

    setAiModelPreset('gpt-5.4');
    setAiModelText('gpt-5.4');
  }, [aiLoaded, aiSettings.apiKey, aiSettings.openAiModel, openAiModelOptions]);

  useEffect(() => {
    refreshMemoryStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showAi) refreshMemoryStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAi]);

  useEffect(() => {
    let isMounted = true;

    const loadUi = async () => {
      try {
        const raw = await AsyncStorage.getItem(UI_STORAGE_KEY);
        if (!isMounted) return;

        if (!raw) {
          setUiLoaded(true);
          return;
        }

        const parsed = JSON.parse(raw) as Partial<{
          showDisplayedTabs: boolean;
          showNightscout: boolean;
          showRanges: boolean;
          showNightWindow: boolean;
          showMealWindows: boolean;
          showAi: boolean;
          showProactiveCare: boolean;
        }>;

        if (typeof parsed.showDisplayedTabs === 'boolean') {
          setShowDisplayedTabs(parsed.showDisplayedTabs);
        }
        if (typeof parsed.showNightscout === 'boolean') {
          setShowNightscout(parsed.showNightscout);
        }
        if (typeof parsed.showRanges === 'boolean') {
          setShowRanges(parsed.showRanges);
        }
        if (typeof parsed.showNightWindow === 'boolean') {
          setShowNightWindow(parsed.showNightWindow);
        }
        if (typeof parsed.showMealWindows === 'boolean') {
          setShowMealWindows(parsed.showMealWindows);
        }
        if (typeof parsed.showAi === 'boolean') {
          setShowAi(parsed.showAi);
        }
        if (typeof parsed.showProactiveCare === 'boolean') {
          setShowProactiveCare(parsed.showProactiveCare);
        }
      } catch (e) {
        // Best-effort: keep defaults.
      } finally {
        if (isMounted) setUiLoaded(true);
      }
    };

    loadUi();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!uiLoaded) return;

    AsyncStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        showDisplayedTabs,
        showNightscout,
        showRanges,
        showNightWindow,
        showMealWindows,
        showAi,
        showProactiveCare,
      }),
    ).catch(() => {
      // Best-effort persistence.
    });
  }, [uiLoaded, showDisplayedTabs, showNightscout, showRanges, showNightWindow, showMealWindows, showAi, showProactiveCare]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let isMounted = true;

    const loadWidgetPrefs = async () => {
      try {
        const raw = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
        if (!isMounted) return;
        if (!raw) {
          setAndroidLiveMode(true);
          setAndroidWidgetLiveModeEnabled(true);
          return;
        }

        const parsed = JSON.parse(raw) as Partial<{liveMode: boolean}>;
        const liveMode = typeof parsed.liveMode === 'boolean' ? parsed.liveMode : true;
        setAndroidLiveMode(liveMode);
        setAndroidWidgetLiveModeEnabled(liveMode);
      } catch {
        if (!isMounted) return;
        setAndroidLiveMode(true);
        setAndroidWidgetLiveModeEnabled(true);
      }
    };

    loadWidgetPrefs();
    return () => {
      isMounted = false;
    };
  }, []);

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.borderColor,
    borderRadius: theme.borderRadius,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minWidth: 90,
    textAlign: 'center' as const,
    color: theme.textColor,
    backgroundColor: theme.white,
  };

  const parseIntStrict = (s: string): number | null => {
    const trimmed = s.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  };

  const setAndroidLiveModeAndPersist = (enabled: boolean) => {
    setAndroidLiveMode(enabled);
    setAndroidWidgetLiveModeEnabled(enabled);
    AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify({liveMode: enabled})).catch(() => {
      // Best-effort persistence.
    });
  };

  const validateAndApplyRanges = () => {
    const severeHypo = parseIntStrict(severeHypoText);
    const hypo = parseIntStrict(hypoText);
    const hyper = parseIntStrict(hyperText);
    const severeHyper = parseIntStrict(severeHyperText);

    if (severeHypo === null || hypo === null || hyper === null || severeHyper === null) {
      setRangeError(tr(language, 'settings.errEnterAllRanges'));
      return;
    }

    const isOrdered = severeHypo < hypo && hypo < hyper && hyper < severeHyper;
    if (!isOrdered) {
      setRangeError(tr(language, 'settings.errRangeOrder'));
      return;
    }

    setRangeError(null);
    setGlucoseSetting('severeHypo', severeHypo);
    setGlucoseSetting('hypo', hypo);
    setGlucoseSetting('hyper', hyper);
    setGlucoseSetting('severeHyper', severeHyper);
  };

  const validateAndApplyNightWindow = () => {
    const start = parseIntStrict(nightStartText);
    const end = parseIntStrict(nightEndText);

    if (start === null || end === null) {
      setRangeError(tr(language, 'settings.errNightHoursRequired'));
      return;
    }

    if (start < 0 || start > 23 || end < 0 || end > 23) {
      setRangeError(tr(language, 'settings.errNightHoursRange'));
      return;
    }

    setRangeError(null);
    setGlucoseSetting('nightStartHour', start);
    setGlucoseSetting('nightEndHour', end);
  };

  const validateAndApplyMealWindows = () => {
    const breakfast = parseIntStrict(breakfastStartText);
    const lunch = parseIntStrict(lunchStartText);
    const dinner = parseIntStrict(dinnerStartText);

    if (breakfast === null || lunch === null || dinner === null) {
      setRangeError(tr(language, 'settings.errMealHoursRequired'));
      return;
    }

    const inRange = [breakfast, lunch, dinner].every(h => h >= 0 && h <= 23);
    if (!inRange) {
      setRangeError(tr(language, 'settings.errMealHoursRange'));
      return;
    }

    if (!(breakfast < lunch && lunch < dinner)) {
      setRangeError(tr(language, 'settings.errMealHoursOrder'));
      return;
    }

    setRangeError(null);
    setGlucoseSetting('breakfastStartHour', breakfast);
    setGlucoseSetting('lunchStartHour', lunch);
    setGlucoseSetting('dinnerStartHour', dinner);
  };

  const validateAndApplyDailyBriefTime = () => {
    const hour = parseIntStrict(dailyBriefHourText);
    const minute = parseIntStrict(dailyBriefMinuteText);

    if (hour === null || minute === null) {
      setRangeError(tr(language, 'settings.errBriefTimeRequired'));
      return;
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      setRangeError(tr(language, 'settings.errBriefTimeRange'));
      return;
    }

    setRangeError(null);
    setProactiveSetting('dailyBrief', {
      ...proactiveSettings.dailyBrief,
      hour,
      minute,
    });
  };

  const triggerDailyBriefNow = async () => {
    try {
      setDailyBriefStatus(tr(language, 'settings.sendingBrief'));
      await sendDailyBriefNow(glucoseSettings, aiSettings);
      setDailyBriefStatus(tr(language, 'settings.briefSent'));
    } catch (e) {
      setDailyBriefStatus(tr(language, 'settings.briefSendFailed'));
    }
  };

  const refreshMemoryStats = async () => {
    try {
      setMemoryBusy(true);
      const stats = await getMemoryStats();
      setMemoryStats(stats as any);
    } finally {
      setMemoryBusy(false);
    }
  };

  const clearMemoryNow = async () => {
    try {
      setMemoryBusy(true);
      await clearAllMemory();
      setMemoryStats({total: 0, byType: {profile: 0, episode: 0, chat_summary: 0}, latestUpdatedAt: null});
    } finally {
      setMemoryBusy(false);
    }
  };

  const persistAiSettings = () => {
    const trimmedKey = (aiApiKeyText ?? '').trim();
    const selectedModel =
      aiModelPreset === 'custom' ? (aiModelText ?? '').trim() : (aiModelPreset ?? '').trim();

    setAiSetting('provider', 'openai');
    setAiSetting('apiKey', trimmedKey);
    if (selectedModel) {
      setAiSetting('openAiModel', selectedModel);
    }
  };

  const checkAndSaveOpenAiKey = async () => {
    const trimmedKey = (aiApiKeyText ?? '').trim();
    if (!trimmedKey) {
      setAiKeyStatus({state: 'invalid', message: tr(language, 'settings.enterApiKeyFirst')});
      return;
    }

    setAiKeyStatus({state: 'checking'});
    const result = await validateOpenAiApiKey(trimmedKey);

    if (result.ok) {
      persistAiSettings();
      setAiKeyStatus({state: 'valid', message: tr(language, 'settings.keyValidSaved')});
      return;
    }

    if (result.reason === 'unauthorized') {
      setAiKeyStatus({state: 'invalid', message: tr(language, 'settings.keyInvalid')});
      return;
    }

    if (result.reason === 'rate_limited') {
      persistAiSettings();
      setAiKeyStatus({
        state: 'valid',
        message: tr(language, 'settings.keyRateLimited'),
      });
      return;
    }

    setAiKeyStatus({
      state: 'error',
      message: result.message || tr(language, 'settings.keyCouldNotVerify'),
    });
  };

  return (
    <ScrollView
      testID={E2E_TEST_IDS.screens.settings}
      contentContainerStyle={{
        paddingBottom: theme.spacing.xl,
        backgroundColor: theme.backgroundColor,
      }}
      style={{flex: 1, backgroundColor: theme.backgroundColor}}
    >
      <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
        <Text
          style={{
            color: theme.textColor,
            fontSize: theme.typography.size.xl,
            fontWeight: '600',
            marginBottom: theme.spacing.md,
          }}
        >
          {tr(language, 'settings.title')}
        </Text>
        <Text
          style={{
            color: theme.textColor,
            fontSize: theme.typography.size.sm,
            opacity: 0.8,
            marginBottom: theme.spacing.lg,
          }}
        >
          {tr(language, 'settings.subtitle')}
        </Text>
      </View>

      <View>
        <SectionHeader
          title={tr(language, 'settings.displayedTabs')}
          expanded={showDisplayedTabs}
          onToggle={() => setShowDisplayedTabs(v => !v)}
        />

        {showDisplayedTabs && (
          <>
            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="home"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.tabHome')}</Text>
              <Switch value={true} disabled={true} />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="timeline"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.tabTrends')}</Text>
              <Switch value={true} disabled={true} />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="settings"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.tabSettings')}</Text>
              <Switch value={true} disabled={true} />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="insights"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.tabOracle')}</Text>
              <Switch
                testID={E2E_TEST_IDS.settings.toggleOracleTab}
                value={settings.showOracle}
                onValueChange={v => setSetting('showOracle', v)}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="fastfood"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.tabFoodTracking')}</Text>
              <Switch
                testID={E2E_TEST_IDS.settings.toggleFoodTab}
                value={settings.showFoodTracking}
                onValueChange={v => setSetting('showFoodTracking', v)}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="directions-run"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.tabSportTracking')}</Text>
              <Switch
                testID={E2E_TEST_IDS.settings.toggleSportTab}
                value={settings.showSportTracking}
                onValueChange={v => setSetting('showSportTracking', v)}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <ADIcon
                  name="notification"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.tabNotifications')}</Text>
              <Switch
                testID={E2E_TEST_IDS.settings.toggleNotificationsTab}
                value={settings.showNotifications}
                onValueChange={v => setSetting('showNotifications', v)}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="smart-toy"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.tabAiAnalyst')}</Text>
              <Switch
                testID={E2E_TEST_IDS.settings.toggleAiAnalystTab}
                value={settings.showAiAnalyst}
                onValueChange={v => setSetting('showAiAnalyst', v)}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="tune"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.tabLoopTuner')}</Text>
              <Switch
                testID={E2E_TEST_IDS.settings.toggleLoopTunerTab}
                value={settings.showLoopTuner}
                onValueChange={v => setSetting('showLoopTuner', v)}
              />
            </View>
          </>
        )}
      </View>

      <View>
        <SectionHeader title={tr(language, 'settings.aiAnalyst')} expanded={showAi} onToggle={() => setShowAi(v => !v)} />

        {showAi && (
          <>
            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="toggle-on" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.enableAiAnalyst')}</Text>
              <Switch
                testID={E2E_TEST_IDS.settings.aiEnabledToggle}
                value={aiSettings.enabled}
                onValueChange={v => setAiSetting('enabled', v)}
              />
            </View>

            <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xs}}>
              <Text style={{color: theme.textColor, opacity: 0.75, fontSize: theme.typography.size.sm}}>
                {tr(language, 'settings.aiKeyHint')}
              </Text>
            </View>

            <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md}}>
              <Text style={{color: theme.textColor, fontWeight: '600', marginBottom: theme.spacing.xs}}>{tr(language, 'settings.openAiApiKey')}</Text>
              <TextInput
                testID={E2E_TEST_IDS.settings.aiApiKeyInput}
                value={aiApiKeyText}
                onChangeText={text => {
                  setAiApiKeyText(text);
                  if (aiKeyStatus.state !== 'idle') setAiKeyStatus({state: 'idle'});
                }}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={true}
                placeholder="sk-..."
                placeholderTextColor={theme.textColor}
                style={{...inputStyle, width: '100%', textAlign: 'left'}}
              />
            </View>

            <View style={{flexDirection: 'row', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm}}>
              <Pressable
                testID={E2E_TEST_IDS.settings.aiSaveKeyButton}
                accessibilityRole="button"
                onPress={persistAiSettings}
                style={({pressed}) => ({
                  flex: 1,
                  marginRight: theme.spacing.sm,
                  paddingVertical: theme.spacing.md,
                  borderRadius: theme.borderRadius,
                  borderWidth: 1,
                  borderColor: theme.borderColor,
                  backgroundColor: pressed ? theme.borderColor : theme.white,
                  alignItems: 'center',
                })}
              >
                <Text style={{color: theme.textColor, fontWeight: '600'}}>{tr(language, 'common.save')}</Text>
              </Pressable>

              <Pressable
                testID={E2E_TEST_IDS.settings.aiCheckKeyButton}
                accessibilityRole="button"
                disabled={aiKeyStatus.state === 'checking'}
                onPress={checkAndSaveOpenAiKey}
                style={({pressed}) => ({
                  flex: 1,
                  paddingVertical: theme.spacing.md,
                  borderRadius: theme.borderRadius,
                  borderWidth: 1,
                  borderColor: theme.borderColor,
                  backgroundColor:
                    aiKeyStatus.state === 'checking'
                      ? theme.borderColor
                      : pressed
                        ? theme.borderColor
                        : theme.white,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                })}
              >
                {aiKeyStatus.state === 'checking' ? (
                  <ActivityIndicator size="small" color={theme.textColor} />
                ) : (
                  <MaterialIcons name="check-circle" size={18} color={theme.textColor} />
                )}
                <Text style={{color: theme.textColor, fontWeight: '600', marginLeft: theme.spacing.sm}}>
                  {aiKeyStatus.state === 'checking' ? tr(language, 'settings.checking') : tr(language, 'settings.checkKey')}
                </Text>
              </Pressable>
            </View>

            {aiKeyStatus.state !== 'idle' && (
              <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm}}>
                <Text
                  style={{
                    color:
                      aiKeyStatus.state === 'valid'
                        ? theme.aboveRangeColor
                        : aiKeyStatus.state === 'checking'
                          ? theme.textColor
                          : theme.belowRangeColor,
                    fontSize: theme.typography.size.sm,
                    opacity: aiKeyStatus.state === 'checking' ? 0.9 : 1,
                  }}
                >
                  {aiKeyStatus.state === 'checking'
                    ? tr(language, 'settings.verifyingKey')
                    : aiKeyStatus.message}
                </Text>
              </View>
            )}

            <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
              <Text style={{color: theme.textColor, fontSize: theme.typography.size.md, fontWeight: '600'}}>
                {tr(language, 'settings.model')}
              </Text>
              <Text style={{color: theme.textColor, opacity: 0.75, fontSize: theme.typography.size.sm, paddingTop: theme.spacing.xs}}>
                {tr(language, 'settings.modelPinned')}
              </Text>
            </View>

            {openAiModelOptions.map(opt => {
              const selected = aiModelPreset === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  testID={`${E2E_TEST_IDS.settings.aiModelPreset}.${opt.id}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setAiModelPreset(opt.id);
                    setAiModelText(opt.id);
                  }}
                  style={({pressed}) => ({
                    ...rowStyle,
                    backgroundColor: pressed ? theme.borderColor : 'transparent',
                  })}
                >
                  <View style={iconContainerStyle}>
                    <MaterialIcons
                      name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={theme.typography.size.lg}
                      color={theme.textColor}
                    />
                  </View>
                  <Text style={labelStyle}>{opt.label}</Text>
                </Pressable>
              );
            })}

            <Pressable
              testID={`${E2E_TEST_IDS.settings.aiModelPreset}.custom`}
              accessibilityRole="button"
              onPress={() => setAiModelPreset('custom')}
              style={({pressed}) => ({
                ...rowStyle,
                backgroundColor: pressed ? theme.borderColor : 'transparent',
              })}
            >
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name={aiModelPreset === 'custom' ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={theme.typography.size.lg}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.customModel')}</Text>
            </Pressable>

            {aiModelPreset === 'custom' && (
              <View style={rowStyle}>
                <View style={iconContainerStyle}>
                  <MaterialIcons name="tune" size={theme.typography.size.xl} color={theme.textColor} />
                </View>
                <Text style={labelStyle}>{tr(language, 'settings.customModelId')}</Text>
                <TextInput
                  testID={E2E_TEST_IDS.settings.aiModelCustomInput}
                  value={aiModelText}
                  onChangeText={setAiModelText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="gpt-5.4"
                  placeholderTextColor={theme.textColor}
                  style={{...inputStyle, minWidth: 160, textAlign: 'left'}}
                />
              </View>
            )}

            <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
              <Text style={{color: theme.textColor, fontSize: theme.typography.size.md, fontWeight: '700'}}>
                {language === 'he' ? 'זיכרון AI' : 'AI Memory'}
              </Text>
              <Text style={{color: addOpacity(theme.textColor, 0.75), marginTop: 6}}>
                {language === 'he'
                  ? `סה"כ ${memoryStats?.total ?? 0} פריטים | פרופיל ${memoryStats?.byType?.profile ?? 0} | אירועים ${memoryStats?.byType?.episode ?? 0} | סיכומים ${memoryStats?.byType?.chat_summary ?? 0}`
                  : `Total ${memoryStats?.total ?? 0} items | profile ${memoryStats?.byType?.profile ?? 0} | episodes ${memoryStats?.byType?.episode ?? 0} | summaries ${memoryStats?.byType?.chat_summary ?? 0}`}
              </Text>
              <View style={{flexDirection: 'row', marginTop: theme.spacing.sm}}>
                <Pressable
                  onPress={refreshMemoryStats}
                  disabled={memoryBusy}
                  style={({pressed}) => ({
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: theme.borderRadius,
                    borderWidth: 1,
                    borderColor: theme.borderColor,
                    backgroundColor: pressed ? theme.borderColor : theme.white,
                    marginRight: theme.spacing.sm,
                  })}
                >
                  <Text style={{color: theme.textColor, fontWeight: '600'}}>
                    {language === 'he' ? 'רענן סטטוס' : 'Refresh stats'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={clearMemoryNow}
                  disabled={memoryBusy}
                  style={({pressed}) => ({
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: theme.borderRadius,
                    borderWidth: 1,
                    borderColor: theme.belowRangeColor,
                    backgroundColor: pressed ? addOpacity(theme.belowRangeColor, 0.2) : theme.white,
                  })}
                >
                  <Text style={{color: theme.belowRangeColor, fontWeight: '700'}}>
                    {language === 'he' ? 'נקה זיכרון' : 'Clear memory'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>

      <View>
        <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.sm}}>
          <Text style={{color: theme.textColor, fontSize: theme.typography.size.md, fontWeight: '700'}}>{tr(language, 'settings.language')}</Text>
        </View>
        <View style={{paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md}}>
          <View style={{flexDirection: 'row', gap: theme.spacing.sm}}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLanguage('en')}
              style={({pressed}) => ({
                flex: 1,
                paddingVertical: theme.spacing.md,
                borderRadius: theme.borderRadius,
                borderWidth: 1,
                borderColor: language === 'en' ? theme.accentColor : theme.borderColor,
                backgroundColor: pressed ? theme.borderColor : theme.white,
                alignItems: 'center',
              })}
            >
              <Text style={{color: theme.textColor, fontWeight: '700'}}>{tr(language, 'settings.languageEnglish')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLanguage('he')}
              style={({pressed}) => ({
                flex: 1,
                paddingVertical: theme.spacing.md,
                borderRadius: theme.borderRadius,
                borderWidth: 1,
                borderColor: language === 'he' ? theme.accentColor : theme.borderColor,
                backgroundColor: pressed ? theme.borderColor : theme.white,
                alignItems: 'center',
              })}
            >
              <Text style={{color: theme.textColor, fontWeight: '700'}}>{tr(language, 'settings.languageHebrew')}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View>
        <SectionHeader
          title={tr(language, 'settings.proactiveCare')}
          expanded={showProactiveCare}
          onToggle={() => setShowProactiveCare(v => !v)}
        />

        {showProactiveCare && (
          <>
            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="auto-awesome" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.enableProactive')}</Text>
              <Switch
                value={proactiveSettings.enabled}
                onValueChange={v => setProactiveSetting('enabled', v)}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="notifications-active" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.hypoNow')}</Text>
              <Switch
                value={proactiveSettings.events.hypoNow}
                onValueChange={v =>
                  setProactiveSetting('events', {
                    ...proactiveSettings.events,
                    hypoNow: v,
                  })
                }
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="wb-sunny" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.morningBrief')}</Text>
              <Switch
                value={proactiveSettings.dailyBrief.enabled}
                onValueChange={v =>
                  setProactiveSetting('dailyBrief', {
                    ...proactiveSettings.dailyBrief,
                    enabled: v,
                  })
                }
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="schedule" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.briefTime')}</Text>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <TextInput
                  value={dailyBriefHourText}
                  onChangeText={setDailyBriefHourText}
                  onBlur={validateAndApplyDailyBriefTime}
                  keyboardType="numeric"
                  style={{...inputStyle, minWidth: 50}}
                  maxLength={2}
                />
                <Text style={{marginHorizontal: 6, color: theme.textColor}}>:</Text>
                <TextInput
                  value={dailyBriefMinuteText}
                  onChangeText={setDailyBriefMinuteText}
                  onBlur={validateAndApplyDailyBriefTime}
                  keyboardType="numeric"
                  style={{...inputStyle, minWidth: 50}}
                  maxLength={2}
                />
              </View>
            </View>

            <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm}}>
              <Pressable
                accessibilityRole="button"
                onPress={triggerDailyBriefNow}
                style={({pressed}) => ({
                  paddingVertical: theme.spacing.md,
                  borderRadius: theme.borderRadius,
                  borderWidth: 1,
                  borderColor: theme.borderColor,
                  backgroundColor: pressed ? theme.borderColor : theme.white,
                  alignItems: 'center',
                })}
              >
                <Text style={{color: theme.textColor, fontWeight: '600'}}>{tr(language, 'settings.sendBriefNow')}</Text>
              </Pressable>
              {dailyBriefStatus ? (
                <Text style={{color: theme.textColor, opacity: 0.8, fontSize: theme.typography.size.sm, paddingTop: theme.spacing.xs}}>
                  {dailyBriefStatus}
                </Text>
              ) : null}
            </View>

            <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm}}>
              <Text style={{color: theme.textColor, opacity: 0.75, fontSize: theme.typography.size.sm}}>
                {tr(language, 'settings.briefIncludes')}
              </Text>
            </View>
          </>
        )}
      </View>

      <NightscoutSection
        expanded={showNightscout}
        onToggleExpanded={() => setShowNightscout(v => !v)}
        profiles={profiles}
        activeProfile={activeProfile}
        onSelectProfile={id => setActiveProfileId(id)}
        onEditProfile={id => navigation.navigate(NIGHTSCOUT_SETUP_SCREEN, {profileId: id})}
        onDeleteProfile={id => {
          deleteProfile(id).catch(() => {
            // Best-effort; avoid crashing Settings.
          });
        }}
        onAddProfile={() => navigation.navigate(NIGHTSCOUT_SETUP_SCREEN)}
      />

      {Platform.OS === 'android' && (
        <View>
          <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.xs}}>
            <Text style={{color: theme.textColor, fontSize: theme.typography.size.md, fontWeight: '700'}}>
              {language === 'he' ? 'ווידג׳ט אנדרואיד' : 'Android Widget'}
            </Text>
          </View>
          <View style={rowStyle}>
            <View style={iconContainerStyle}>
              <MaterialIcons name="bolt" size={theme.typography.size.xl} color={theme.textColor} />
            </View>
            <View style={{flex: 1, paddingRight: theme.spacing.sm}}>
              <Text style={labelStyle}>{language === 'he' ? 'Live Mode (כל דקה)' : 'Live Mode (every minute)'}</Text>
              <Text style={{color: theme.textColor, opacity: 0.72, fontSize: theme.typography.size.xs}}>
                {language === 'he'
                  ? 'עדכון כמעט רציף דרך שירות רקע. צורך יותר סוללה ומציג התראה קבועה.'
                  : 'Near real-time refresh via foreground service. Uses more battery and keeps a persistent notification.'}
              </Text>
            </View>
            <Switch value={androidLiveMode} onValueChange={setAndroidLiveModeAndPersist} />
          </View>
        </View>
      )}

      <View>
        <SectionHeader
          title={tr(language, 'settings.ranges')}
          expanded={showRanges}
          onToggle={() => setShowRanges(v => !v)}
        />

        {showRanges && (
          <>
            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="trending-down"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.severeHypo')}</Text>
              <TextInput
                testID={E2E_TEST_IDS.settings.severeHypoInput}
                value={severeHypoText}
                onChangeText={setSevereHypoText}
                onBlur={validateAndApplyRanges}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="arrow-downward"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.hypo')}</Text>
              <TextInput
                testID={E2E_TEST_IDS.settings.hypoInput}
                value={hypoText}
                onChangeText={setHypoText}
                onBlur={validateAndApplyRanges}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="arrow-upward"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.hyper')}</Text>
              <TextInput
                testID={E2E_TEST_IDS.settings.hyperInput}
                value={hyperText}
                onChangeText={setHyperText}
                onBlur={validateAndApplyRanges}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="trending-up"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.severeHyper')}</Text>
              <TextInput
                testID={E2E_TEST_IDS.settings.severeHyperInput}
                value={severeHyperText}
                onChangeText={setSevereHyperText}
                onBlur={validateAndApplyRanges}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>

            <Text
              style={{
                color: theme.textColor,
                fontSize: theme.typography.size.sm,
                opacity: 0.8,
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.sm,
              }}
            >
              {tr(language, 'settings.rangesHint')}
            </Text>
          </>
        )}

        <SectionHeader
          title={tr(language, 'settings.nightWindow')}
          expanded={showNightWindow}
          onToggle={() => setShowNightWindow(v => !v)}
        />

        {showNightWindow && (
          <>
            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="nights-stay"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.nightStart')}</Text>
              <TextInput
                testID={E2E_TEST_IDS.settings.nightStartHourInput}
                value={nightStartText}
                onChangeText={setNightStartText}
                onBlur={validateAndApplyNightWindow}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons
                  name="wb-sunny"
                  size={theme.typography.size.xl}
                  color={theme.textColor}
                />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.nightEnd')}</Text>
              <TextInput
                testID={E2E_TEST_IDS.settings.nightEndHourInput}
                value={nightEndText}
                onChangeText={setNightEndText}
                onBlur={validateAndApplyNightWindow}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>
          </>
        )}

        <SectionHeader
          title={tr(language, 'settings.mealWindows')}
          expanded={showMealWindows}
          onToggle={() => setShowMealWindows(v => !v)}
        />

        {showMealWindows && (
          <>
            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="free-breakfast" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.breakfastStart')}</Text>
              <TextInput
                value={breakfastStartText}
                onChangeText={setBreakfastStartText}
                onBlur={validateAndApplyMealWindows}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="lunch-dining" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.lunchStart')}</Text>
              <TextInput
                value={lunchStartText}
                onChangeText={setLunchStartText}
                onBlur={validateAndApplyMealWindows}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="dinner-dining" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>{tr(language, 'settings.dinnerStart')}</Text>
              <TextInput
                value={dinnerStartText}
                onChangeText={setDinnerStartText}
                onBlur={validateAndApplyMealWindows}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>
          </>
        )}

        {!!rangeError && (
          <Text
            style={{
              color: theme.belowRangeColor,
              fontSize: theme.typography.size.sm,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.sm,
            }}
          >
            {rangeError}
          </Text>
        )}
      </View>
    </ScrollView>
  );
};

export default Settings;


