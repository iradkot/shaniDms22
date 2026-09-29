import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {SettingsAppInfo, SettingsLanguage} from '../../modules/settings';
import {productUiTokens} from '../ui';

export const AppVersionRow = ({appInfo, locale}: {
  readonly appInfo?: SettingsAppInfo;
  readonly locale: SettingsLanguage;
}) => {
  const he = locale === 'he';
  const builtAt = appInfo?.builtAt ? Date.parse(appInfo.builtAt) : Number.NaN;
  return (
    <View style={styles.card} testID="settings-app-version">
      <Text style={[styles.title, he && styles.rtl]}>
        {he ? 'גרסת האפליקציה' : 'App version'}
      </Text>
      <Text selectable style={[styles.value, he && styles.rtl]}>
        {appInfo?.versionName || appInfo?.revision || (he ? 'לא זמינה' : 'Not available')}
      </Text>
      {appInfo?.buildNumber ? (
        <Text selectable style={[styles.detail, he && styles.rtl]} testID="settings-app-build">
          {`${he ? 'מספר בנייה' : 'Build'}: ${appInfo.buildNumber}`}
        </Text>
      ) : null}
      {Number.isFinite(builtAt) ? (
        <Text selectable style={[styles.detail, he && styles.rtl]} testID="settings-app-built-at">
          {`${he ? 'נבנה בתאריך' : 'Built on'}: ${new Date(builtAt).toLocaleString(he ? 'he-IL' : 'en-GB')}`}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {padding: 16, borderRadius: 16, gap: 4, backgroundColor: productUiTokens.colors.surface},
  title: {fontSize: 14, fontWeight: '600', color: productUiTokens.colors.textMuted},
  value: {fontSize: 17, fontWeight: '700', color: productUiTokens.colors.text},
  detail: {fontSize: 13, color: productUiTokens.colors.textMuted},
  rtl: {textAlign: 'right'},
});
