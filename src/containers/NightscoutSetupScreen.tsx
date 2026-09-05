import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  NavigationProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useNightscoutConfig} from 'app/contexts/NightscoutConfigContext';
import {PRODUCT_EXPERIENCE_SCREEN} from 'app/constants/SCREEN_NAMES';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';
import {
  normalizeNightscoutApiSecretToSha1,
  normalizeNightscoutUrl,
} from 'app/services/nightscoutProfiles';

/**
 * Nightscout configuration screen.
 *
 * - When opened without params, adds a new profile.
 * - When opened with `{profileId}`, edits that existing profile.
 */
const NightscoutSetupScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const route = useRoute<any>();
  const {addProfile, updateProfile, profiles, testProfileConnection} =
    useNightscoutConfig();
  const {language, setLanguage} = useAppLanguage();
  const rtl = language === 'he';

  const profileId: string | undefined = route?.params?.profileId;
  const editingProfile = profileId
    ? profiles.find(p => p.id === profileId)
    : undefined;

  const [urlInput, setUrlInput] = useState(editingProfile?.baseUrl ?? '');
  const [secretInput, setSecretInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  useEffect(() => {
    // Prefill after async profile load, but don't clobber user edits.
    if (editingProfile?.baseUrl && !urlInput.trim()) {
      setUrlInput(editingProfile.baseUrl);
    }
  }, [editingProfile?.baseUrl, urlInput]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const onTestConnection = async () => {
    if (saving || testing) {
      return;
    }
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await testProfileConnection({
        ...(editingProfile ? {profileId: editingProfile.id} : {}),
        urlInput,
        secretInput,
      });
      setSuccess(
        tr(
          language,
          result.entriesCount > 0
            ? 'nightscoutSetup.testSuccess'
            : 'nightscoutSetup.testSuccessNoEntries',
        ),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : tr(language, 'nightscoutSetup.testFailed'),
      );
    } finally {
      setTesting(false);
    }
  };

  const onSave = async () => {
    if (saving || testing) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (!normalizeNightscoutUrl(urlInput)) {
        setError(tr(language, 'nightscoutSetup.invalidUrl'));
        return;
      }
      if (
        (!editingProfile || secretInput.trim().length > 0) &&
        !normalizeNightscoutApiSecretToSha1(secretInput)
      ) {
        setError(tr(language, 'nightscoutSetup.invalidSecret'));
        return;
      }
      if (editingProfile) {
        await updateProfile({
          profileId: editingProfile.id,
          urlInput,
          secretInput,
        });
      } else {
        await addProfile({urlInput, secretInput});
      }

      if (
        typeof (navigation as any).canGoBack === 'function' &&
        (navigation as any).canGoBack()
      ) {
        navigation.goBack();
      } else {
        navigation.reset({
          index: 0,
          routes: [{name: PRODUCT_EXPERIENCE_SCREEN}],
        });
      }
    } catch {
      setError(tr(language, 'nightscoutSetup.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.screen}>
      <View style={[styles.languageRow, rtl && styles.rowReverse]}>
        {(['he', 'en'] as const).map(locale => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{checked: language === locale}}
            key={locale}
            onPress={() => setLanguage(locale)}
            style={[
              styles.languageOption,
              language === locale && styles.languageOptionSelected,
            ]}
            testID={`nightscout-language-${locale}`}>
            <Text
              style={[
                styles.languageText,
                language === locale && styles.languageTextSelected,
              ]}>
              {locale === 'he' ? 'עברית' : 'English'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.header}>
        <View style={styles.cloudMark}>
          <Text style={styles.cloudGlyph}>NS</Text>
        </View>
        <Text style={[styles.title, rtl && styles.rtlText]}>
          {editingProfile
            ? tr(language, 'nightscoutSetup.editTitle')
            : tr(language, 'nightscoutSetup.connectTitle')}
        </Text>
        <Text style={[styles.intro, rtl && styles.rtlText]}>
          {tr(language, 'nightscoutSetup.intro', {
            example: 'jvA4cWn9c7zxgTyZ',
          })}
        </Text>
      </View>

      <View style={styles.readOnlyCard}>
        <Text style={[styles.readOnlyText, rtl && styles.rtlText]}>
          {tr(language, 'nightscoutSetup.readOnly')}
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={[styles.label, rtl && styles.rtlText]}>
          {tr(language, 'nightscoutSetup.urlLabel')}
        </Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setUrlInput}
          placeholder={tr(language, 'nightscoutSetup.urlPlaceholder')}
          placeholderTextColor="#8292A1"
          style={[styles.input, rtl && styles.rtlInput]}
          testID="nightscout-url-input"
          value={urlInput}
        />

        <Text style={[styles.label, styles.secretLabel, rtl && styles.rtlText]}>
          {tr(language, 'nightscoutSetup.secretLabel')}
        </Text>
        <View style={[styles.input, styles.secretInputRow]}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSecretInput}
            placeholder={
              editingProfile
                ? tr(language, 'nightscoutSetup.secretPlaceholderKeep')
                : tr(language, 'nightscoutSetup.secretPlaceholder')
            }
            placeholderTextColor="#8292A1"
            keyboardType={showSecret ? 'visible-password' : 'default'}
            secureTextEntry={!showSecret}
            style={[styles.secretInput, rtl && styles.rtlInput]}
            testID="nightscout-secret-input"
            value={secretInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr(
              language,
              showSecret
                ? 'nightscoutSetup.hideSecret'
                : 'nightscoutSetup.showSecret',
            )}
            onPress={() => setShowSecret(value => !value)}
            style={styles.secretVisibilityButton}
            testID="nightscout-secret-visibility">
            <MaterialIcons
              name={showSecret ? 'visibility-off' : 'visibility'}
              size={22}
              color={styles.languageText.color}
            />
          </Pressable>
        </View>

        {error ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, rtl && styles.rtlText]}>
            {error}
          </Text>
        ) : null}

        {success ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.success, rtl && styles.rtlText]}>
            {success}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{disabled: saving || testing, busy: testing}}
          disabled={saving || testing}
          onPress={onTestConnection}
          style={({pressed}) => [
            styles.testButton,
            (saving || testing) && styles.disabled,
            pressed && !saving && !testing && styles.pressed,
          ]}
          testID="nightscout-test-connection">
          {testing ? (
            <ActivityIndicator color={styles.testButtonText.color} />
          ) : (
            <Text style={styles.testButtonText}>
              {tr(language, 'nightscoutSetup.testConnection')}
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{disabled: saving || testing, busy: saving}}
          disabled={saving || testing}
          onPress={onSave}
          style={({pressed}) => [
            styles.saveButton,
            (saving || testing) && styles.disabled,
            pressed && !saving && !testing && styles.pressed,
          ]}
          testID="nightscout-save">
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {tr(language, 'nightscoutSetup.saveContinue')}
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {backgroundColor: '#F2F7FC'},
  content: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 680,
    padding: 22,
    paddingBottom: 44,
  },
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right'},
  rtlInput: {textAlign: 'right'},
  languageRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    padding: 3,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  languageOption: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 17,
  },
  languageOptionSelected: {backgroundColor: '#1769AA'},
  languageText: {color: '#52677B', fontSize: 13, fontWeight: '700'},
  languageTextSelected: {color: '#FFFFFF'},
  header: {marginTop: 24, alignItems: 'center'},
  cloudMark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#E1F3FF',
  },
  cloudGlyph: {color: '#1769AA', fontSize: 22, fontWeight: '900'},
  title: {
    width: '100%',
    marginTop: 16,
    color: '#14283B',
    fontSize: 29,
    fontWeight: '900',
    textAlign: 'center',
  },
  intro: {
    width: '100%',
    marginTop: 10,
    color: '#52677B',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  readOnlyCard: {
    marginTop: 22,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B9DDF4',
    backgroundColor: '#EAF6FF',
  },
  readOnlyText: {color: '#285978', fontSize: 14, lineHeight: 21},
  formCard: {
    marginTop: 16,
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D7E4EF',
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#244B6C',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  label: {color: '#243C52', fontSize: 14, fontWeight: '800', marginBottom: 7},
  secretLabel: {marginTop: 18},
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#C9D8E5',
    borderRadius: 14,
    color: '#14283B',
    backgroundColor: '#F9FBFD',
    fontSize: 16,
  },
  error: {marginTop: 12, color: '#A22B2B', fontSize: 14, lineHeight: 20},
  success: {marginTop: 12, color: '#237A48', fontSize: 14, lineHeight: 20},
  secretInputRow: {flexDirection: 'row', alignItems: 'center', paddingEnd: 0},
  secretInput: {flex: 1, color: '#14283B', fontSize: 16, minHeight: 50},
  secretVisibilityButton: {
    width: 44,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 22,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1769AA',
  },
  testButtonText: {color: '#1769AA', fontSize: 16, fontWeight: '700'},
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 22,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#1769AA',
  },
  saveButtonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '900'},
  disabled: {opacity: 0.55},
  pressed: {opacity: 0.78, transform: [{scale: 0.99}]},
});

export default NightscoutSetupScreen;
