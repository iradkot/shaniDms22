import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  PRIVACY_POLICY,
  PRIVACY_POLICY_VERSION,
  type PrivacyRuntime,
} from '../../modules/privacy';
import type {DestinationLocale} from '../destinations';

export const PrivacyView = ({
  locale,
  runtime,
  readOnly = false,
}: {
  readonly locale: DestinationLocale;
  readonly runtime: PrivacyRuntime;
  readonly readOnly?: boolean;
}) => {
  const he = locale === 'he';
  const [cloud, setCloud] = useState(runtime.consent?.cloudSync ?? false);
  const [ai, setAi] = useState(runtime.consent?.aiProcessing ?? false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string>();
  const act = async (action: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (reason) {
      const code = (reason as {code?: string; status?: number})?.code;
      setError(
        code === 'local_cleanup_account_changed'
          ? he
            ? 'המחיקה בענן הושלמה. יש להתנתק מהחשבון הנוכחי ואז לנסות שוב כדי להשלים את הניקוי במכשיר.'
            : 'Cloud deletion finished. Sign out of the current account, then retry to finish clearing this device.'
          : code === 'recent_auth_required'
          ? he
            ? 'יש להתחבר מחדש עם Google ואז לנסות למחוק שוב. שום הצלחה לא אושרה.'
            : 'Sign in again with Google, then retry deletion. Completion has not been confirmed.'
          : he
          ? 'הפעולה לא הושלמה. אפשר לנסות שוב. אם מחיקה התחילה, השיתוף נשאר חסום עד להשלמתה.'
          : 'The operation did not complete. Try again. If deletion started, sharing stays blocked until it finishes.',
      );
    } finally {
      setBusy(false);
    }
  };
  const button = (
    id: string,
    label: string,
    action: () => void,
    checked?: boolean,
  ) => (
    <Pressable
      key={id}
      testID={id}
      accessibilityRole={checked === undefined ? 'button' : 'checkbox'}
      accessibilityState={{
        disabled: busy,
        ...(checked === undefined ? {} : {checked}),
      }}
      disabled={busy}
      onPress={action}
      style={styles.button}>
      <Text style={styles.label}>
        {checked === undefined ? '' : checked ? '☑ ' : '☐ '}
        {label}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      testID="privacy-view">
      <Text accessibilityRole="header" style={[styles.title, he && styles.rtl]}>
        {he ? 'פרטיות והמידע שלך' : 'Privacy and your data'}
      </Text>
      <Text style={[styles.body, he && styles.rtl]}>
        {he
          ? `גרסת הסכמה: ${runtime.consent?.policyVersion ?? 'טרם ניתנה'}`
          : `Consent version: ${runtime.consent?.policyVersion ?? 'not given'}`}
      </Text>
      {PRIVACY_POLICY[locale].map((paragraph, index) => (
        <Text key={index} style={[styles.body, he && styles.rtl]}>
          {paragraph}
        </Text>
      ))}
      {!readOnly ? (
        <>
          {button(
            'privacy-cloud-choice',
            he
              ? 'אני מסכים/ה לסנכרון בענן Google Firebase ולשימוש בשרת ShaniDms'
              : 'I agree to Google Firebase cloud sync and the ShaniDms server',
            () => {
              setCloud(!cloud);
              if (cloud) {
                setAi(false);
              }
            },
            cloud,
          )}
          {button(
            'privacy-ai-choice',
            he
              ? 'אני מסכים/ה בנפרד לשליחת המידע המתואר ל־OpenAI לצורך בקשות AI (דורש גם הסכמת ענן)'
              : 'I separately agree to send the described data to OpenAI for AI requests (cloud consent is also required)',
            () => {
              if (cloud) {
                setAi(!ai);
              }
            },
            ai,
          )}
          {button(
            'privacy-save',
            he ? 'שמירת הבחירות שלי' : 'Save my choices',
            () => act(() => runtime.saveConsent(cloud, ai)),
          )}
          <Text style={[styles.body, he && styles.rtl]}>
            {he
              ? 'לשימוש מקומי בלבד, השאירו את שתי האפשרויות ללא סימון. אין צורך בהסכמה ל־AI כדי להציג ולבדוק נתונים.'
              : 'For local use only, leave both choices unchecked. AI consent is not needed to display and review data.'}
          </Text>
          {runtime.consent !== null
            ? button(
                'privacy-revoke',
                he ? 'ביטול כל השיתוף החדש' : 'Withdraw all new sharing',
                () => act(() => runtime.saveConsent(false, false)),
              )
            : null}
          <View style={styles.danger}>
            <Text style={[styles.title, he && styles.rtl]}>
              {he ? 'מחיקת חשבון ונתונים' : 'Delete account and data'}
            </Text>
            <Text style={[styles.body, he && styles.rtl]}>
              {he
                ? 'מחיקה לצמיתות של חשבון ShaniDms, הנתונים בענן, התמונות ומפתחות החיבור, ושל המידע המקומי במכשיר הזה. תידרש כניסה עדכנית עם Google. הפעולה אינה מוחקת את Nightscout או את חשבון Google. מידע של חשבונות אחרים במכשיר עשוי להישאר.'
                : 'Permanently delete your ShaniDms account, cloud records, images, connection keys, and local data on this device. Recent Google sign-in is required. Nightscout and your Google account are kept. Other accounts’ data on this device may remain.'}
            </Text>
            {confirmDelete ? (
              <>
                <Text style={[styles.body, he && styles.rtl]}>
                  {he
                    ? 'לא ניתן לשחזר את הנתונים. לאשר מחיקה לצמיתות?'
                    : 'These data cannot be restored. Confirm permanent deletion?'}
                </Text>
                {button(
                  'privacy-confirm-delete',
                  he ? 'כן, למחוק לצמיתות' : 'Yes, permanently delete',
                  () => act(runtime.deleteAccount),
                )}
                {button('privacy-cancel-delete', he ? 'ביטול' : 'Cancel', () =>
                  setConfirmDelete(false),
                )}
              </>
            ) : (
              button(
                'privacy-delete',
                he ? 'מחיקת החשבון והנתונים שלי' : 'Delete my account and data',
                () => setConfirmDelete(true),
              )
            )}
          </View>
        </>
      ) : null}
      {busy ? <ActivityIndicator testID="privacy-busy" /> : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={styles.error}
          testID="privacy-error">
          {error}
        </Text>
      ) : null}
      {error && runtime.reauthenticate
        ? button(
            'privacy-reauthenticate',
            he
              ? 'חיבור מחדש עם Google או התנתקות לצורך ניקוי'
              : 'Reconnect Google or sign out to finish cleanup',
            () => act(runtime.reauthenticate!),
          )
        : null}
      <Text style={[styles.body, he && styles.rtl]}>
        {PRIVACY_POLICY_VERSION}
      </Text>
      {runtime.onClose
        ? button('privacy-close', he ? 'סגירה' : 'Close', runtime.onClose)
        : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F5F7FA'},
  content: {padding: 24, gap: 12},
  title: {fontSize: 22, fontWeight: '700', color: '#17324D'},
  body: {fontSize: 16, lineHeight: 24, color: '#17324D'},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  button: {padding: 14, borderRadius: 10, backgroundColor: '#E0ECF6'},
  label: {fontSize: 16, color: '#14558A'},
  danger: {
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#B63A3A',
    borderRadius: 10,
  },
  error: {color: '#B63A3A', fontSize: 16},
});
