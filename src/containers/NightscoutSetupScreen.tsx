import React, {useEffect, useState} from 'react';
import {ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {NavigationProp, useNavigation, useRoute} from '@react-navigation/native';
import {theme} from 'app/style/theme';
import {useNightscoutConfig} from 'app/contexts/NightscoutConfigContext';
import {MAIN_TAB_NAVIGATOR} from 'app/constants/SCREEN_NAMES';

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
  const {addProfile, updateProfile, profiles} = useNightscoutConfig();

  const profileId: string | undefined = route?.params?.profileId;
  const editingProfile = profileId ? profiles.find(p => p.id === profileId) : undefined;

  const [urlInput, setUrlInput] = useState(editingProfile?.baseUrl ?? '');
  const [secretInput, setSecretInput] = useState('');
    useEffect(() => {
      // Prefill after async profile load, but don't clobber user edits.
      if (editingProfile?.baseUrl && !urlInput.trim()) {
        setUrlInput(editingProfile.baseUrl);
      }
    }, [editingProfile?.baseUrl, urlInput]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
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
      setError(e?.message ?? 'Failed to save Nightscout settings.');
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
        {editingProfile ? 'Edit Nightscout' : 'Connect Nightscout'}
      </Text>

      <Text style={{color: theme.textColor, opacity: 0.8, marginBottom: theme.spacing.lg}}>
        Enter your Nightscout URL and API secret. The app accepts either the full secret (e.g.{' '}
        jvA4cWn9c7zxgTyZ) or the SHA1 “minified” value (40 hex).
      </Text>

      <Text style={{color: theme.textColor, marginBottom: theme.spacing.sm}}>Nightscout URL</Text>
      <TextInput
        value={urlInput}
        onChangeText={setUrlInput}
        placeholder="https://your-nightscout-site.com"
        placeholderTextColor={theme.textColor}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={inputStyle}
      />

      <View style={{height: theme.spacing.lg}} />

      <Text style={{color: theme.textColor, marginBottom: theme.spacing.sm}}>API secret / token</Text>
      <TextInput
        value={secretInput}
        onChangeText={setSecretInput}
        placeholder={editingProfile ? 'Leave blank to keep current' : 'API secret'}
        placeholderTextColor={theme.textColor}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={inputStyle}
      />

      {error && (
        <Text style={{color: theme.belowRangeColor, marginTop: theme.spacing.md}}>
          {error}
        </Text>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        onPress={onSave}
        disabled={saving}
        style={{
          marginTop: theme.spacing.xl,
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
          <Text style={{color: theme.white, fontWeight: '600'}}>Save & Continue</Text>
        )}
      </TouchableOpacity>

      <View style={{flex: 1}} />
    </ScrollView>
  );
};

export default NightscoutSetupScreen;
