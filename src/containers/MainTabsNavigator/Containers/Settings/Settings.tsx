import React, {useEffect, useState} from 'react';
import {ScrollView, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {theme} from 'app/style/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {useTabsSettings} from 'app/contexts/TabsSettingsContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {useNightscoutConfig} from 'app/contexts/NightscoutConfigContext';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ADIcon from 'react-native-vector-icons/AntDesign';
import {useNavigation} from '@react-navigation/native';
import {NIGHTSCOUT_SETUP_SCREEN} from 'app/constants/SCREEN_NAMES';

const rowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingVertical: theme.spacing.md,
  paddingHorizontal: theme.spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: theme.borderColor,
};

const iconContainerStyle = {
  width: 28,
  alignItems: 'center' as const,
  marginRight: theme.spacing.md,
};

const labelStyle = {
  color: theme.textColor,
  fontSize: theme.typography.size.md,
  flex: 1,
  paddingRight: theme.spacing.md,
};

const sectionHeaderRowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
};

const sectionHeaderTextStyle = {
  color: theme.textColor,
  fontSize: theme.typography.size.lg,
  fontWeight: '600' as const,
};

const sectionHeaderContainerStyle = {
  paddingHorizontal: theme.spacing.lg,
  paddingTop: theme.spacing.lg,
  paddingBottom: theme.spacing.sm,
};

function SectionHeader(props: {title: string; expanded: boolean; onToggle: () => void}) {
  const {title, expanded, onToggle} = props;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onToggle}
      style={sectionHeaderContainerStyle}
      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
    >
      <View style={sectionHeaderRowStyle}>
        <Text style={sectionHeaderTextStyle}>{title}</Text>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={24}
          color={theme.textColor}
        />
      </View>
    </TouchableOpacity>
  );
}

const UI_STORAGE_KEY = 'settings.ui.v1';

const Settings: React.FC = () => {
  const navigation = useNavigation<any>();
  const {settings, setSetting} = useTabsSettings();
  const {settings: glucoseSettings, setSetting: setGlucoseSetting, isLoaded: glucoseLoaded} =
    useGlucoseSettings();
  const {profiles, activeProfile, setActiveProfileId} = useNightscoutConfig();

  const [showDisplayedTabs, setShowDisplayedTabs] = useState(true);
  const [showNightscout, setShowNightscout] = useState(false);
  const [showRanges, setShowRanges] = useState(false);
  const [showNightWindow, setShowNightWindow] = useState(false);
  const [uiLoaded, setUiLoaded] = useState(false);

  const [severeHypoText, setSevereHypoText] = useState('');
  const [hypoText, setHypoText] = useState('');
  const [hyperText, setHyperText] = useState('');
  const [severeHyperText, setSevereHyperText] = useState('');
  const [nightStartText, setNightStartText] = useState('');
  const [nightEndText, setNightEndText] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);

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
      }),
    ).catch(() => {
      // Best-effort persistence.
    });
  }, [uiLoaded, showDisplayedTabs, showRanges, showNightWindow]);

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
                <MaterialIcons name="home" size={20} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>Home</Text>
              <Switch value={true} disabled={true} />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="timeline" size={20} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>Trends</Text>
              <Switch value={true} disabled={true} />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="settings" size={20} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>Settings</Text>
              <Switch value={true} disabled={true} />
            </View>

            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="fastfood" size={20} color={theme.textColor} />
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
                  size={20}
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
                <ADIcon name="notification" size={20} color={theme.textColor} />
              </View>
              <Text style={labelStyle}>Notifications</Text>
              <Switch
                testID={E2E_TEST_IDS.settings.toggleNotificationsTab}
                value={settings.showNotifications}
                onValueChange={v => setSetting('showNotifications', v)}
              />
            </View>
          </>
        )}
      </View>

      <View>
        <SectionHeader
          title="Nightscout"
          expanded={showNightscout}
          onToggle={() => setShowNightscout(v => !v)}
        />

        {showNightscout && (
          <>
            <View style={rowStyle}>
              <View style={iconContainerStyle}>
                <MaterialIcons name="cloud" size={20} color={theme.textColor} />
              </View>
              <View style={{flex: 1, paddingRight: theme.spacing.md}}>
                <Text style={{color: theme.textColor, fontSize: theme.typography.size.md}}>
                  Active profile
                </Text>
                <Text
                  style={{
                    color: theme.textColor,
                    fontSize: theme.typography.size.sm,
                    opacity: 0.8,
                    marginTop: 2,
                  }}
                >
                  {activeProfile ? `${activeProfile.label} (${activeProfile.baseUrl})` : 'Not configured'}
                </Text>
              </View>
            </View>

            {profiles.map(p => {
              const isActive = activeProfile?.id === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  accessibilityRole="button"
                  onPress={() => setActiveProfileId(p.id)}
                  style={rowStyle}
                >
                  <View style={iconContainerStyle}>
                    <MaterialIcons
                      name={isActive ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={20}
                      color={theme.textColor}
                    />
                  </View>
                  <View style={{flex: 1, paddingRight: theme.spacing.md}}>
                    <Text style={{color: theme.textColor, fontSize: theme.typography.size.md}}>
                      {p.label}
                    </Text>
                    <Text
                      style={{
                        color: theme.textColor,
                        fontSize: theme.typography.size.sm,
                        opacity: 0.8,
                        marginTop: 2,
                      }}
                    >
                      {p.baseUrl}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md}}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => navigation.navigate(NIGHTSCOUT_SETUP_SCREEN)}
                style={{
                  paddingVertical: theme.spacing.md,
                  paddingHorizontal: theme.spacing.lg,
                  backgroundColor: theme.accentColor,
                  borderRadius: theme.borderRadius,
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{color: theme.buttonTextColor, fontWeight: '600'}}>
                  Add Nightscout profile
                </Text>
              </TouchableOpacity>
            </View>

            {!profiles.length && (
              <Text
                style={{
                  color: theme.textColor,
                  fontSize: theme.typography.size.sm,
                  opacity: 0.8,
                  paddingHorizontal: theme.spacing.lg,
                  paddingTop: theme.spacing.sm,
                }}
              >
                You need at least one Nightscout profile to view data.
              </Text>
            )}
          </>
        )}
      </View>

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
                <MaterialIcons name="trending-down" size={20} color={theme.textColor} />
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
                <MaterialIcons name="arrow-downward" size={20} color={theme.textColor} />
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
                <MaterialIcons name="arrow-upward" size={20} color={theme.textColor} />
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
                <MaterialIcons name="trending-up" size={20} color={theme.textColor} />
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
                <MaterialIcons name="nights-stay" size={20} color={theme.textColor} />
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
                <MaterialIcons name="wb-sunny" size={20} color={theme.textColor} />
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

