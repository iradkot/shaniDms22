import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {DestinationLocale} from '../destinations';
import {productUiTokens} from '../ui';
import {
  aiConnectionErrorMessage,
  getAiConnectionErrorCode,
  OPENAI_API_KEYS_URL,
  OPENAI_BILLING_URL,
} from './aiConnectionFeedback';

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
  readonly status: {
    readonly credentialConfigured: boolean;
    readonly credentialSyncState?:
      | 'idle'
      | 'configured'
      | 'pending'
      | 'syncing'
      | 'error';
    readonly credentialSyncPending?: boolean;
    readonly credentialErrorCode?: string;
  };
  readonly diagnostics?: readonly SettingsDiagnosticLine[];
  readonly onClose: () => void;
  readonly onSignOut?: () => Promise<void>;
  readonly onSaveAiCredential?: (credential: string) => Promise<void>;
  readonly onClearAiCredential?: () => Promise<void>;
  readonly onRetryAiCredential?: () => Promise<void>;
  readonly onTestAiConnection?: () => Promise<void>;
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
    configured:
      'An OpenAI key is saved securely. Test the connection to check that AI is available.',
    pending:
      'The key change is waiting to sync. It has not been completed yet.',
    existingConnection:
      'Your previously saved key remains available until the replacement succeeds.',
    syncing: 'Syncing the key change securely…',
    retry: 'Retry',
    test: 'Test AI connection',
    connected: 'OpenAI responded successfully. The AI connection works.',
    testNote:
      'The test sends a short message with no health data. OpenAI may charge a small API usage fee.',
    createKey: 'Open OpenAI key page',
    billing: 'OpenAI API billing',
    setup:
      'Open the OpenAI key page, create or copy a key, then paste it here. A ChatGPT subscription does not include API credit.',
    saving: 'Checking and saving…',
    missing: 'No AI credential is configured for this account.',
    localOnly:
      'The key is sent to the encrypted account vault and is never shown again. If you save while offline, it stays protected on this device until upload succeeds.',
    newCredential: 'New API key',
    save: 'Save new key',
    clear: 'Remove key',
    confirmClear: 'Remove the key from the encrypted account vault?',
    saved: 'The key was saved securely. You can now test the AI connection.',
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
    configured: 'מפתח OpenAI שמור באופן מאובטח. בדיקת חיבור תוודא שה־AI זמין.',
    pending: 'השינוי במפתח ממתין לסנכרון. הפעולה עדיין לא הושלמה.',
    existingConnection: 'המפתח הקודם נשאר זמין עד שהחלפתו תצליח.',
    syncing: 'השינוי במפתח מסונכרן באופן מאובטח…',
    retry: 'ניסיון נוסף',
    test: 'בדיקת חיבור AI',
    connected: 'OpenAI ענתה בהצלחה. חיבור ה־AI עובד.',
    testNote:
      'הבדיקה שולחת הודעה קצרה ללא מידע רפואי. ייתכן חיוב API קטן מצד OpenAI.',
    createKey: 'פתיחת עמוד המפתחות של OpenAI',
    billing: 'חיוב OpenAI API',
    setup:
      'פותחים את עמוד המפתחות ב־OpenAI, יוצרים או מעתיקים מפתח ומדביקים כאן. מנוי ChatGPT אינו כולל יתרת API.',
    saving: 'בודק ושומר…',
    missing: 'לא מוגדר מפתח AI לחשבון הזה.',
    localOnly:
      'המפתח נשלח לכספת החשבון המוצפנת ולא יוצג שוב. בשמירה ללא חיבור הוא נשאר מוגן במכשיר עד שההעלאה מצליחה.',
    newCredential: 'מפתח API חדש',
    save: 'שמירת מפתח חדש',
    clear: 'מחיקת המפתח',
    confirmClear: 'למחוק את המפתח מכספת החשבון המוצפנת?',
    saved: 'המפתח נשמר באופן מאובטח. אפשר כעת לבדוק את חיבור ה־AI.',
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
  onRetryAiCredential,
  onTestAiConnection,
}: SettingsDetailViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [credential, setCredential] = useState('');
  const [confirming, setConfirming] = useState<'sign-out' | 'clear' | null>(
    null,
  );
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const [message, setMessage] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const syncing = status.credentialSyncState === 'syncing';
  const busy = working || syncing;

  const run = async (
    action: () => Promise<void>,
    success: string,
    clearInput = false,
  ) => {
    if (workingRef.current || syncing) {
      return;
    }
    setWorking(true);
    workingRef.current = true;
    setMessage(undefined);
    setFailed(false);
    try {
      await action();
      if (clearInput) {
        setCredential('');
      }
      setConfirming(null);
      setMessage(success);
    } catch (error) {
      setFailed(true);
      setMessage(
        section === 'ai-credentials'
          ? aiConnectionErrorMessage(locale, getAiConnectionErrorCode(error))
          : copy.failed,
      );
    } finally {
      workingRef.current = false;
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
          disabled={busy}
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
              {syncing
                ? copy.syncing
                : status.credentialSyncPending
                ? copy.pending
                : status.credentialConfigured
                ? copy.configured
                : copy.missing}
            </Text>
            {status.credentialSyncState === 'error' && !message ? (
              <Text
                accessibilityRole="alert"
                style={[styles.error, rtl && styles.rtlText]}>
                {aiConnectionErrorMessage(
                  locale,
                  status.credentialErrorCode ?? 'unknown',
                )}
              </Text>
            ) : null}
            {status.credentialSyncPending && status.credentialConfigured ? (
              <Text style={[styles.note, rtl && styles.rtlText]}>
                {copy.existingConnection}
              </Text>
            ) : null}
            {onRetryAiCredential &&
            (status.credentialSyncPending ||
              status.credentialSyncState === 'error') ? (
              <Button
                disabled={busy}
                label={copy.retry}
                testID="settings-detail-retry-ai"
                onPress={() => run(onRetryAiCredential, '')}
              />
            ) : null}
            <Text style={[styles.note, rtl && styles.rtlText]}>
              {copy.setup}
            </Text>
            <Button
              disabled={busy}
              label={copy.createKey}
              testID="settings-detail-open-ai-keys"
              onPress={() =>
                run(async () => {
                  await Linking.openURL(OPENAI_API_KEYS_URL);
                }, '')
              }
            />
            <Text style={[styles.note, rtl && styles.rtlText]}>
              {copy.localOnly}
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              onChangeText={value => {
                setCredential(value);
                setMessage(undefined);
              }}
              placeholder={copy.newCredential}
              accessibilityLabel={copy.newCredential}
              textContentType="none"
              autoComplete="off"
              secureTextEntry
              style={styles.input}
              value={credential}
            />
            <Button
              disabled={
                busy || !onSaveAiCredential || credential.trim().length === 0
              }
              label={working ? copy.saving : copy.save}
              onPress={() =>
                onSaveAiCredential
                  ? run(
                      () => onSaveAiCredential(credential.trim()),
                      copy.saved,
                      true,
                    )
                  : undefined
              }
              testID="settings-detail-save-ai"
            />
            {status.credentialConfigured && onTestAiConnection ? (
              <>
                <Button
                  disabled={busy}
                  label={copy.test}
                  testID="settings-detail-test-ai"
                  onPress={() => run(onTestAiConnection, copy.connected)}
                />
                <Text style={[styles.note, rtl && styles.rtlText]}>
                  {copy.testNote}
                </Text>
              </>
            ) : null}
            <Button
              disabled={busy}
              label={copy.billing}
              testID="settings-detail-open-ai-billing"
              onPress={() =>
                run(async () => {
                  await Linking.openURL(OPENAI_BILLING_URL);
                }, '')
              }
            />
            {(status.credentialConfigured || status.credentialSyncPending) &&
            onClearAiCredential ? (
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

        {busy ? (
          <ActivityIndicator color={productUiTokens.colors.action} />
        ) : null}
        {message ? (
          <Text
            accessibilityRole="alert"
            style={[
              styles.message,
              failed && styles.error,
              rtl && styles.rtlText,
            ]}>
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
    writingDirection: 'ltr',
    textAlign: 'left',
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
  error: {color: '#A22B2B', fontSize: 14, fontWeight: '700'},
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
