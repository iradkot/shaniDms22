import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
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
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ADIcon from 'react-native-vector-icons/AntDesign';
import {useNavigation} from '@react-navigation/native';
import {NIGHTSCOUT_SETUP_SCREEN} from 'app/constants/SCREEN_NAMES';
import {validateOpenAiApiKey} from 'app/services/llm/providers/openaiProvider';
import {NightscoutSection} from './sections/NightscoutSection';
import {iconContainerStyle, labelStyle, rowStyle, SectionHeader} from './settingsShared';

const UI_STORAGE_KEY = 'settings.ui.v1';

const Settings: React.FC = () => {
  const navigation = useNavigation<any>();
  const {settings, setSetting} = useTabsSettings();
  const {settings: glucoseSettings, setSetting: setGlucoseSetting, isLoaded: glucoseLoaded} =
    useGlucoseSettings();
  const {profiles, activeProfile, setActiveProfileId, deleteProfile} = useNightscoutConfig();
  const {settings: aiSettings, setSetting: setAiSetting, isLoaded: aiLoaded} = useAiSettings();

  const [showDisplayedTabs, setShowDisplayedTabs] = useState(true);
  const [showNightscout, setShowNightscout] = useState(false);
  const [showRanges, setShowRanges] = useState(false);
  const [showNightWindow, setShowNightWindow] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [uiLoaded, setUiLoaded] = useState(false);

  const [aiApiKeyText, setAiApiKeyText] = useState('');
  const [aiModelText, setAiModelText] = useState('');
  const [aiModelPreset, setAiModelPreset] = useState<string>('gpt-4o-mini');
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
  const [rangeError, setRangeError] = useState<string | null>(null);

  const openAiModelOptions = useMemo(
    () => [
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
  }, [glucoseLoaded, glucoseSettings]);

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

    setAiModelPreset('gpt-4o-mini');
    setAiModelText('gpt-4o-mini');
  }, [aiLoaded, aiSettings.apiKey, aiSettings.openAiModel, openAiModelOptions]);

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
          showAi: boolean;
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
        if (typeof parsed.showAi === 'boolean') {
          setShowAi(parsed.showAi);
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
        showAi,
      }),
    ).catch(() => {
      // Best-effort persistence.
    });
  }, [uiLoaded, showDisplayedTabs, showNightscout, showRanges, showNightWindow, showAi]);

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

  const validateAndApplyRanges = () => {
    const severeHypo = parseIntStrict(severeHypoText);
    const hypo = parseIntStrict(hypoText);
    const hyper = parseIntStrict(hyperText);
    const severeHyper = parseIntStrict(severeHyperText);

    if (severeHypo === null || hypo === null || hyper === null || severeHyper === null) {
      setRangeError('Please enter all range values.');
      return;
    }

    const isOrdered = severeHypo < hypo && hypo < hyper && hyper < severeHyper;
    if (!isOrdered) {
      setRangeError('Ranges must be ordered: severe hypo < hypo < hyper < severe hyper.');
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
      setRangeError('Please enter both night start and end hours (0–23).');
      return;
    }

    if (start < 0 || start > 23 || end < 0 || end > 23) {
      setRangeError('Night window hours must be between 0 and 23.');
      return;
    }

    setRangeError(null);
    setGlucoseSetting('nightStartHour', start);
    setGlucoseSetting('nightEndHour', end);
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
      setAiKeyStatus({state: 'invalid', message: 'Please enter an API key first.'});
      return;
    }

    setAiKeyStatus({state: 'checking'});
    const result = await validateOpenAiApiKey(trimmedKey);

    if (result.ok) {
      persistAiSettings();
      setAiKeyStatus({state: 'valid', message: 'Key looks valid. Saved.'});
      return;
    }

    if (result.reason === 'unauthorized') {
      setAiKeyStatus({state: 'invalid', message: 'Invalid key (unauthorized). Please retry.'});
      return;
    }

    if (result.reason === 'rate_limited') {
      persistAiSettings();
      setAiKeyStatus({
        state: 'valid',
        message: 'Key saved, but OpenAI returned 429 (quota/rate limit).',
      });
      return;
    }

    setAiKeyStatus({
      state: 'error',
      message: result.message || 'Could not verify key. Please retry.',
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
          Settings
        </Text>
        <Text
          style={{
            color: theme.textColor,
            fontSize: theme.typography.size.sm,
            opacity: 0.8,
            marginBottom: theme.spacing.lg,
          }}
        >
          Choose which tabs are visible in the bottom bar.
        </Text>
      </View>

      <View>
        <SectionHeader
          title="Displayed Tabs"
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
              <Text style={labelStyle}>Home</Text>
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
              <Text style={labelStyle}>Trends</Text>
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
              <Text style={labelStyle}>Settings</Text>
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
              <Text style={labelStyle}>Oracle</Text>
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
              <Text style={labelStyle}>Food Tracking</Text>
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
              <Text style={labelStyle}>Sport Tracking</Text>
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
              <Text style={labelStyle}>Notifications</Text>
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
              <Text style={labelStyle}>AI Analyst</Text>
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
              <Text style={labelStyle}>Loop Tuner</Text>
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
        <SectionHeader title="AI Analyst" expanded={showAi} onToggle={() => setShowAi(v => !v)} />

        {showAi && (
          <>
            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="toggle-on" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>Enable AI Analyst</Text>
              <Switch
                testID={E2E_TEST_IDS.settings.aiEnabledToggle}
                value={aiSettings.enabled}
                onValueChange={v => setAiSetting('enabled', v)}
              />
            </View>

            <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xs}}>
              <Text style={{color: theme.textColor, opacity: 0.75, fontSize: theme.typography.size.sm}}>
                Requires your own OpenAI key. We don’t provide free LLM tokens.
              </Text>
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="vpn-key" size={theme.typography.size.xl} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>OpenAI API key</Text>
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
                style={{...inputStyle, minWidth: 160, textAlign: 'left'}}
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
                <Text style={{color: theme.textColor, fontWeight: '600'}}>Save</Text>
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
                  {aiKeyStatus.state === 'checking' ? 'Checking…' : 'Check key'}
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
                    ? 'Verifying your key with OpenAI…'
                    : aiKeyStatus.message}
                </Text>
              </View>
            )}

            <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
              <Text style={{color: theme.textColor, fontSize: theme.typography.size.md, fontWeight: '600'}}>
                Model
              </Text>
              <Text style={{color: theme.textColor, opacity: 0.75, fontSize: theme.typography.size.sm, paddingTop: theme.spacing.xs}}>
                Choose a preset or Custom.
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
              <Text style={labelStyle}>Custom model</Text>
            </Pressable>

            {aiModelPreset === 'custom' && (
              <View style={rowStyle}>
                <View style={iconContainerStyle}>
                  <MaterialIcons name="tune" size={theme.typography.size.xl} color={theme.textColor} />
                </View>
                <Text style={labelStyle}>Custom model id</Text>
                <TextInput
                  testID={E2E_TEST_IDS.settings.aiModelCustomInput}
                  value={aiModelText}
                  onChangeText={setAiModelText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="gpt-4o-mini"
                  placeholderTextColor={theme.textColor}
                  style={{...inputStyle, minWidth: 160, textAlign: 'left'}}
                />
              </View>
            )}
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

      <View>
        <SectionHeader
          title="Ranges"
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
              <Text style={labelStyle}>Severe Hypo (mg/dL)</Text>
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
              <Text style={labelStyle}>Hypo (mg/dL)</Text>
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
              <Text style={labelStyle}>Hyper (mg/dL)</Text>
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
              <Text style={labelStyle}>Severe Hyper (mg/dL)</Text>
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
              Changes affect time-in-range and charts.
            </Text>
          </>
        )}

        <SectionHeader
          title="Night Window"
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
              <Text style={labelStyle}>Night start (0–23)</Text>
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
              <Text style={labelStyle}>Night end (0–23)</Text>
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

