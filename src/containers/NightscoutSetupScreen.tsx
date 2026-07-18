import React, {useEffect, useState} from 'react';
import {ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {NavigationProp, useNavigation, useRoute} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {theme} from 'app/style/theme';
import {useNightscoutConfig} from 'app/contexts/NightscoutConfigContext';
import {MAIN_TAB_NAVIGATOR} from 'app/constants/SCREEN_NAMES';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

const inputStyle = {
  borderWidth: 1,
  borderColor: theme.borderColor,
  borderRadius: theme.borderRadius,
  paddingHorizontal: theme.spacing.md,
  paddingVertical: theme.spacing.sm,
  color: theme.textColor,
  backgroundColor: theme.white,
};

/**
 * Nightscout configuration screen.
 *
 * - When opened without params, adds a new profile.
 * - When opened with `{profileId}`, edits that existing profile.
 */
const NightscoutSetupScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const route = useRoute<any>();
  const {addProfile, updateProfile, profiles, testProfileConnection} = useNightscoutConfig();
  const {language} = useAppLanguage();

  const profileId: string | undefined = route?.params?.profileId;
  const editingProfile = profileId ? profiles.find(p => p.id === profileId) : undefined;

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
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const onTestConnection = async () => {
    if (saving || testing) return;
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await testProfileConnection({
        profileId: editingProfile?.id,
        urlInput,
        secretInput,
      });
      setSuccess(
        result.entriesCount > 0
          ? tr(language, 'nightscoutSetup.testSuccess')
          : tr(language, 'nightscoutSetup.testSuccessNoEntries'),
      );
    } catch (e: any) {
      setError(e?.message ?? tr(language, 'nightscoutSetup.testFailed'));
    } finally {
      setTesting(false);
    }
  };

  const onSave = async () => {
    if (saving || testing) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingProfile) {
        await updateProfile({profileId: editingProfile.id, urlInput, secretInput});
      } else {
        await addProfile({urlInput, secretInput});
      }

      if (typeof (navigation as any).canGoBack === 'function' && (navigation as any).canGoBack()) {
        navigation.goBack();
      } else {
        navigation.reset({
          index: 0,
          routes: [{name: MAIN_TAB_NAVIGATOR}],
        });
      }
    } catch (e: any) {
      setError(e?.message ?? tr(language, 'nightscoutSetup.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        padding: theme.spacing.lg,
        backgroundColor: theme.backgroundColor,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={{
          color: theme.textColor,
          fontSize: theme.typography.size.xl,
          fontWeight: '600',
          marginBottom: theme.spacing.md,
        }}
      >
        {editingProfile
          ? tr(language, 'nightscoutSetup.editTitle')
          : tr(language, 'nightscoutSetup.connectTitle')}
      </Text>

      <Text style={{color: theme.textColor, opacity: 0.8, marginBottom: theme.spacing.lg}}>
        {tr(language, 'nightscoutSetup.intro', {example: 'jvA4cWn9c7zxgTyZ'})}
      </Text>

      <Text style={{color: theme.textColor, marginBottom: theme.spacing.sm}}>
        {tr(language, 'nightscoutSetup.urlLabel')}
      </Text>
      <TextInput
        value={urlInput}
        onChangeText={setUrlInput}
        placeholder={tr(language, 'nightscoutSetup.urlPlaceholder')}
        placeholderTextColor={theme.textColor}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={inputStyle}
      />

      <View style={{height: theme.spacing.lg}} />

      <Text style={{color: theme.textColor, marginBottom: theme.spacing.sm}}>
        {tr(language, 'nightscoutSetup.secretLabel')}
      </Text>
      <View
        style={{
          ...inputStyle,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 0,
        }}
      >
        <TextInput
          value={secretInput}
          onChangeText={setSecretInput}
          placeholder={
            editingProfile
              ? tr(language, 'nightscoutSetup.secretPlaceholderKeep')
              : tr(language, 'nightscoutSetup.secretPlaceholder')
          }
          placeholderTextColor={theme.textColor}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={showSecret ? 'visible-password' : 'default'}
          secureTextEntry={!showSecret}
          style={{
            flex: 1,
            paddingVertical: theme.spacing.sm,
            color: theme.textColor,
          }}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={
            showSecret
              ? tr(language, 'nightscoutSetup.hideSecret')
              : tr(language, 'nightscoutSetup.showSecret')
          }
          onPress={() => setShowSecret(v => !v)}
          hitSlop={{top: 10, right: 10, bottom: 10, left: 10}}
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialIcons
            name={showSecret ? 'visibility-off' : 'visibility'}
            size={22}
            color={theme.accentColor}
          />
        </TouchableOpacity>
      </View>

      {error && (
        <Text style={{color: theme.belowRangeColor, marginTop: theme.spacing.md}}>
          {error}
        </Text>
      )}
      {success && (
        <Text style={{color: theme.inRangeColor, marginTop: theme.spacing.md}}>
          {success}
        </Text>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        onPress={onTestConnection}
        disabled={saving || testing}
        style={{
          marginTop: theme.spacing.xl,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderWidth: 1,
          borderColor: theme.accentColor,
          borderRadius: theme.borderRadius,
          opacity: testing ? 0.7 : 1,
          alignItems: 'center',
        }}
      >
        {testing ? (
          <ActivityIndicator color={theme.accentColor} />
        ) : (
          <Text style={{color: theme.accentColor, fontWeight: '600'}}>
            {tr(language, 'nightscoutSetup.testConnection')}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        onPress={onSave}
        disabled={saving || testing}
        style={{
          marginTop: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          backgroundColor: theme.accentColor,
          borderRadius: theme.borderRadius,
          opacity: saving ? 0.7 : 1,
          alignItems: 'center',
        }}
      >
        {saving ? (
          <ActivityIndicator color={theme.white} />
        ) : (
          <Text style={{color: theme.white, fontWeight: '600'}}>
            {tr(language, 'nightscoutSetup.saveContinue')}
          </Text>
        )}
      </TouchableOpacity>

      <View style={{flex: 1}} />
    </ScrollView>
  );
};

export default NightscoutSetupScreen;
