import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from '../ui';

export type SettingsDetailSection =
  | 'account'
  | 'ai-credentials'
  | 'diagnostics';

export interface SettingsDiagnosticLine {
  readonly label: string;
  readonly value: string;
}

export interface SettingsDetailViewProps {
  readonly section: SettingsDetailSection;
  readonly locale: DestinationLocale;
  readonly accountLabel?: string;
  readonly status: {readonly credentialConfigured: boolean};
  readonly diagnostics?: readonly SettingsDiagnosticLine[];
  readonly onClose: () => void;
  readonly onSignOut?: () => Promise<void>;
  readonly onSaveAiCredential?: (credential: string) => Promise<void>;
  readonly onClearAiCredential?: () => Promise<void>;
}

const COPY = {
  en: {
    accountTitle: 'Google account',
    accountDescription:
      'Your account keeps each Workspace and its app-owned data isolated.',
    signedOut: 'No Google account is signed in.',
    signOut: 'Sign out',
    confirmSignOut: 'Sign out of this device?',
    confirm: 'Confirm',
    cancel: 'Cancel',
    aiTitle: 'AI credential',
    aiDescription:
      'Advisory only. The AI cannot change therapy or Nightscout data.',
    configured: 'A credential is configured. Its value is never shown.',
    missing: 'No AI credential is configured for this account.',
    localOnly:
      'The key is sent to the encrypted account vault and is never shown again. If you save while offline, it stays protected on this device until upload succeeds.',
    newCredential: 'New API key',
    save: 'Save new key',
    clear: 'Remove key',
    confirmClear: 'Remove the key from the encrypted account vault?',
    saved: 'The new key was saved.',
    cleared: 'The key was removed.',
    failed: 'The change could not be completed. Try again.',
    diagnosticsTitle: 'Diagnostics',
    diagnosticsDescription:
      'Safe status only. Credentials and raw health data are not shown.',
    noDiagnostics: 'No diagnostic status is available.',
    close: 'Close',
  },
  he: {
    accountTitle: 'חשבון Google',
    accountDescription:
      'החשבון שומר על הפרדה בין כל סביבת עבודה והמידע שנוצר בה.',
    signedOut: 'אין חשבון Google מחובר.',
    signOut: 'התנתקות',
    confirmSignOut: 'להתנתק מהחשבון במכשיר הזה?',
    confirm: 'אישור',
    cancel: 'ביטול',
    aiTitle: 'מפתח AI',
    aiDescription: 'לייעוץ בלבד. ה־AI לא משנה טיפול או מידע ב־Nightscout.',
    configured: 'מפתח מוגדר. הערך שלו לעולם אינו מוצג.',
    missing: 'לא מוגדר מפתח AI לחשבון הזה.',
    localOnly:
      'המפתח נשלח לכספת החשבון המוצפנת ולא יוצג שוב. בשמירה ללא חיבור הוא נשאר מוגן במכשיר עד שההעלאה מצליחה.',
    newCredential: 'מפתח API חדש',
    save: 'שמירת מפתח חדש',
    clear: 'מחיקת המפתח',
    confirmClear: 'למחוק את המפתח מכספת החשבון המוצפנת?',
    saved: 'המפתח החדש נשמר.',
    cleared: 'המפתח נמחק.',
    failed: 'לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב.',
    diagnosticsTitle: 'אבחון טכני',
    diagnosticsDescription:
      'מוצג רק מצב בטוח. פרטי גישה ומידע רפואי גולמי אינם מוצגים.',
    noDiagnostics: 'אין כרגע מידע אבחון זמין.',
    close: 'סגירה',
  },
} as const;

const Button = ({
  label,
  testID,
  disabled = false,
  destructive = false,
  onPress,
}: {
  readonly label: string;
  readonly testID: string;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{disabled}}
    disabled={disabled}
    onPress={onPress}
    style={({pressed}) => [
      styles.button,
      destructive && styles.destructiveButton,
      disabled && styles.disabled,
      pressed && !disabled && styles.pressed,
    ]}
    testID={testID}>
    <Text
      style={[
        styles.buttonLabel,
        destructive && styles.destructiveButtonLabel,
      ]}>
      {label}
    </Text>
  </Pressable>
);

export const SettingsDetailView = ({
  section,
  locale,
  accountLabel,
  status,
  diagnostics = [],
  onClose,
  onSignOut,
  onSaveAiCredential,
  onClearAiCredential,
}: SettingsDetailViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [credential, setCredential] = useState('');
  const [confirming, setConfirming] = useState<'sign-out' | 'clear' | null>(
    null,
  );
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  const run = async (action: () => Promise<void>, success: string) => {
    if (working) {
      return;
    }
    setWorking(true);
    setMessage(undefined);
    try {
      await action();
      setCredential('');
      setConfirming(null);
      setMessage(success);
    } catch {
      setMessage(copy.failed);
    } finally {
      setWorking(false);
    }
  };

  const title =
    section === 'account'
      ? copy.accountTitle
      : section === 'ai-credentials'
      ? copy.aiTitle
      : copy.diagnosticsTitle;

  return (
    <View
      style={[styles.root, rtl && styles.rtlRoot]}
      testID="settings-detail-view">
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <Text style={[styles.title, rtl && styles.rtlText]}>{title}</Text>
        <Button
          label={copy.close}
          onPress={onClose}
          testID="settings-detail-close"
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {section === 'account' ? (
          <View style={styles.card}>
            <Text style={[styles.description, rtl && styles.rtlText]}>
              {copy.accountDescription}
            </Text>
            <Text style={[styles.value, rtl && styles.rtlText]}>
              {accountLabel || copy.signedOut}
            </Text>
            {onSignOut ? (
              confirming === 'sign-out' ? (
                <View style={styles.confirmation}>
                  <Text style={[styles.warning, rtl && styles.rtlText]}>
                    {copy.confirmSignOut}
                  </Text>
                  <View style={[styles.actions, rtl && styles.rowReverse]}>
                    <Button
                      disabled={working}
                      label={copy.confirm}
                      onPress={() => run(onSignOut, '')}
                      testID="settings-detail-confirm-sign-out"
                    />
                    <Button
                      disabled={working}
                      label={copy.cancel}
                      onPress={() => setConfirming(null)}
                      testID="settings-detail-cancel-sign-out"
                    />
                  </View>
                </View>
              ) : (
                <Button
                  destructive
                  disabled={working}
                  label={copy.signOut}
                  onPress={() => setConfirming('sign-out')}
                  testID="settings-detail-sign-out"
                />
              )
            ) : null}
          </View>
        ) : null}

        {section === 'ai-credentials' ? (
          <View style={styles.card}>
            <Text style={[styles.description, rtl && styles.rtlText]}>
              {copy.aiDescription}
            </Text>
            <Text style={[styles.value, rtl && styles.rtlText]}>
              {status.credentialConfigured ? copy.configured : copy.missing}
            </Text>
            <Text style={[styles.note, rtl && styles.rtlText]}>
              {copy.localOnly}
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!working}
              onChangeText={setCredential}
              placeholder={copy.newCredential}
              secureTextEntry
              style={[styles.input, rtl && styles.rtlInput]}
              value={credential}
            />
            <Button
              disabled={working || credential.trim().length === 0}
              label={copy.save}
              onPress={() =>
                onSaveAiCredential
                  ? run(() => onSaveAiCredential(credential.trim()), copy.saved)
                  : undefined
              }
              testID="settings-detail-save-ai"
            />
            {status.credentialConfigured && onClearAiCredential ? (
              confirming === 'clear' ? (
                <View style={styles.confirmation}>
                  <Text style={[styles.warning, rtl && styles.rtlText]}>
                    {copy.confirmClear}
                  </Text>
                  <View style={[styles.actions, rtl && styles.rowReverse]}>
                    <Button
                      destructive
                      disabled={working}
                      label={copy.confirm}
                      onPress={() => run(onClearAiCredential, copy.cleared)}
                      testID="settings-detail-confirm-clear-ai"
                    />
                    <Button
                      disabled={working}
                      label={copy.cancel}
                      onPress={() => setConfirming(null)}
                      testID="settings-detail-cancel-clear-ai"
                    />
                  </View>
                </View>
              ) : (
                <Button
                  destructive
                  disabled={working}
                  label={copy.clear}
                  onPress={() => setConfirming('clear')}
                  testID="settings-detail-clear-ai"
                />
              )
            ) : null}
          </View>
        ) : null}

        {section === 'diagnostics' ? (
          <View style={styles.card}>
            <Text style={[styles.description, rtl && styles.rtlText]}>
              {copy.diagnosticsDescription}
            </Text>
            {diagnostics.length === 0 ? (
              <Text style={[styles.note, rtl && styles.rtlText]}>
                {copy.noDiagnostics}
              </Text>
            ) : (
              diagnostics.map(item => (
                <View
                  key={item.label}
                  style={[styles.diagnosticRow, rtl && styles.rowReverse]}>
                  <Text style={[styles.diagnosticLabel, rtl && styles.rtlText]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.diagnosticValue, rtl && styles.rtlText]}>
                    {item.value}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        {working ? (
          <ActivityIndicator color={productUiTokens.colors.action} />
        ) : null}
        {message ? (
          <Text
            accessibilityRole="alert"
            style={[styles.message, rtl && styles.rtlText]}>
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: productUiTokens.colors.page,
  },
  rtlRoot: {direction: 'rtl'},
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: productUiTokens.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: productUiTokens.spacing.lg,
    paddingVertical: productUiTokens.spacing.md,
  },
  rowReverse: {flexDirection: 'row-reverse'},
  title: {
    color: productUiTokens.colors.text,
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
  },
  rtlText: {textAlign: 'right'},
  content: {
    gap: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    gap: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.lg,
  },
  description: {
    color: productUiTokens.colors.text,
    fontSize: 16,
    lineHeight: 23,
  },
  value: {color: '#29425C', fontSize: 16, fontWeight: '700'},
  note: {color: productUiTokens.colors.textMuted, fontSize: 13, lineHeight: 19},
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    color: productUiTokens.colors.text,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: productUiTokens.spacing.md,
  },
  rtlInput: {textAlign: 'right'},
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E7F1FF',
    borderRadius: productUiTokens.radii.card,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: productUiTokens.spacing.md,
    paddingVertical: productUiTokens.spacing.sm,
  },
  destructiveButton: {backgroundColor: '#FDECEC'},
  buttonLabel: {color: productUiTokens.colors.action, fontWeight: '800'},
  destructiveButtonLabel: {color: '#A22B2B'},
  disabled: {opacity: 0.45},
  pressed: {opacity: 0.72},
  confirmation: {
    backgroundColor: '#FFF8EC',
    borderRadius: productUiTokens.radii.card,
    gap: productUiTokens.spacing.sm,
    padding: productUiTokens.spacing.md,
  },
  warning: {color: '#744A00', fontSize: 15, fontWeight: '700'},
  actions: {flexDirection: 'row', gap: productUiTokens.spacing.sm},
  message: {color: '#255B35', fontSize: 14, fontWeight: '700'},
  diagnosticRow: {
    borderBottomColor: productUiTokens.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: productUiTokens.spacing.sm,
  },
  diagnosticLabel: {color: productUiTokens.colors.textMuted, fontSize: 14},
  diagnosticValue: {
    color: productUiTokens.colors.text,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    marginStart: productUiTokens.spacing.md,
  },
});
