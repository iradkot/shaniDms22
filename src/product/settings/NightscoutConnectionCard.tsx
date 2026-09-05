import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useTheme} from 'styled-components/native';
import type {ThemeType} from '../../types/theme';
import type {SettingsOverview} from '../../modules/settings';
import type {DestinationLocale} from '../destinations';
import type {
  SettingsNightscoutConnectionRuntime,
  SettingsNightscoutTestResult,
} from './runtime';

const COPY = {
  en: {
    configured: 'Source saved. Connection not tested yet.',
    missing: 'No Nightscout source is configured.',
    loading: 'Loading glucose from Nightscout…',
    receiving: 'Glucose received from Nightscout.',
    unavailable:
      'The latest glucose request failed. Test the connection or edit the source.',
    credential: 'Configured on this device',
    credentialMissing: 'Credential not configured',
    test: 'Test connection',
    testing: 'Testing connection…',
    edit: 'Edit connection',
    add: 'Connect Nightscout',
    verified: 'Connection verified. Glucose data is available.',
    empty:
      'Connection verified, but Nightscout returned no glucose readings. Check the sensor upload.',
    stale:
      'The latest glucose reading is more than 10 minutes old. Check the sensor upload.',
    latest: 'Latest glucose reading',
    recovery: (count: number) =>
      count === 1
        ? 'A saved connection from the previous app version can be restored.'
        : `${count} saved connections from the previous app version can be restored.`,
    restore: 'Restore previous connection',
    confirmRestore: 'Restore to this account',
    confirm:
      'Restore the connections saved on this device to your currently signed-in account? Continue only if those connections belong to you. Their credentials will be checked before restoring.',
    restoring: 'Checking and restoring…',
    recovered: 'The previous connection was restored to this account.',
    recoveryFailed:
      'Restore failed. Try again or enter your connection details using Connect Nightscout or Edit connection. The saved connection has been kept.',
    cancel: 'Cancel',
    errors: {
      authentication:
        'Nightscout rejected the credential. Edit the connection and check the API secret or token.',
      'not-found':
        'The Nightscout API was not found. Edit the connection and check the site address.',
      timeout:
        'Nightscout did not respond in time. Check your internet connection and try again.',
      network:
        'Nightscout could not be reached. Check your internet connection and site address, then try again.',
      'invalid-response':
        'The site did not return Nightscout glucose data. Check the site address.',
      unknown:
        'The connection test failed. Check your internet connection, site address and credential, then try again.',
    },
  },
  he: {
    configured: 'המקור שמור. החיבור עדיין לא נבדק.',
    missing: 'עדיין לא הוגדר מקור Nightscout.',
    loading: 'טוען סוכר מ־Nightscout…',
    receiving: 'התקבלו נתוני סוכר מ־Nightscout.',
    unavailable:
      'טעינת הסוכר האחרונה נכשלה. אפשר לבדוק את החיבור או לערוך את המקור.',
    credential: 'מוגדר במכשיר הזה',
    credentialMissing: 'לא הוגדר מפתח גישה',
    test: 'בדיקת חיבור',
    testing: 'בודק את החיבור…',
    edit: 'עריכת החיבור',
    add: 'חיבור ל־Nightscout',
    verified: 'החיבור תקין. נתוני סוכר זמינים.',
    empty:
      'החיבור תקין, אבל Nightscout לא החזיר מדידות סוכר. יש לבדוק את העלאת הנתונים מהחיישן.',
    stale:
      'מדידת הסוכר האחרונה ישנה מ־10 דקות. יש לבדוק את העלאת הנתונים מהחיישן.',
    latest: 'מדידת הסוכר האחרונה',
    recovery: (count: number) =>
      count === 1
        ? 'נמצא חיבור מהגרסה הקודמת שאפשר לשחזר.'
        : `אפשר לשחזר ${count} חיבורים שנשמרו בגרסה הקודמת.`,
    restore: 'שחזור החיבור הקודם',
    confirmRestore: 'שחזור לחשבון הזה',
    confirm:
      'לשחזר את החיבורים שנשמרו במכשיר לחשבון המחובר כעת? יש להמשיך רק אם החיבורים האלה שייכים לך. מפתחות הגישה ייבדקו לפני השחזור.',
    restoring: 'בודק ומשחזר…',
    recovered: 'החיבור הקודם שוחזר לחשבון הזה.',
    recoveryFailed:
      'השחזור נכשל. אפשר לנסות שוב או להזין מחדש את פרטי החיבור דרך חיבור ל־Nightscout או עריכת החיבור. המידע לשחזור נשמר.',
    cancel: 'ביטול',
    errors: {
      authentication:
        'Nightscout דחה את מפתח הגישה. יש לערוך את החיבור ולבדוק את הסוד או הטוקן.',
      'not-found':
        'כתובת ה־API של Nightscout לא נמצאה. יש לערוך את החיבור ולבדוק את כתובת האתר.',
      timeout:
        'Nightscout לא הגיב בזמן. יש לבדוק את החיבור לאינטרנט ולנסות שוב.',
      network:
        'לא ניתן להגיע ל־Nightscout. יש לבדוק את האינטרנט ואת כתובת האתר ולנסות שוב.',
      'invalid-response':
        'האתר לא החזיר נתוני סוכר של Nightscout. יש לבדוק את כתובת האתר.',
      unknown:
        'בדיקת החיבור נכשלה. יש לבדוק את האינטרנט, את כתובת האתר ואת מפתח הגישה ולנסות שוב.',
    },
  },
} as const;

type TestState =
  | {readonly status: 'idle'}
  | {readonly status: 'testing'; readonly sourceKey: string}
  | {
      readonly status: 'done';
      readonly sourceKey: string;
      readonly result: SettingsNightscoutTestResult;
    };

type RecoveryState = 'idle' | 'confirm' | 'restoring' | 'done' | 'failed';

const connectionStatusText = (
  copy: (typeof COPY)[DestinationLocale],
  testing: boolean,
  configured: boolean,
  result: SettingsNightscoutTestResult | undefined,
  status: SettingsNightscoutConnectionRuntime['status'] | undefined,
): string => {
  if (testing) {
    return copy.testing;
  }
  if (result?.status === 'failed') {
    return copy.errors[result.reason];
  }
  if (result?.status === 'connected') {
    return result.entriesCount > 0 ? copy.verified : copy.empty;
  }
  if (status === 'loading') {
    return copy.loading;
  }
  if (!configured) {
    return copy.missing;
  }
  if (status === 'failed') {
    return copy.unavailable;
  }
  if (status === 'connected') {
    return copy.receiving;
  }
  return copy.configured;
};

export const NightscoutConnectionCard = ({
  source,
  connection,
  locale,
  onEdit,
}: {
  readonly source: SettingsOverview['nightscout'];
  readonly connection?: SettingsNightscoutConnectionRuntime;
  readonly locale: DestinationLocale;
  readonly onEdit?: () => void;
}) => {
  const theme = useTheme() as ThemeType;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const sourceKey = connection?.sourceKey ?? source.displayLabel ?? '';
  const sequence = useRef(0);
  const recoverySequence = useRef(0);
  const inFlight = useRef(false);
  const [test, setTest] = useState<TestState>({status: 'idle'});
  const [recovery, setRecovery] = useState<RecoveryState>('idle');
  const recovering = useRef(false);
  useLayoutEffect(() => {
    sequence.current += 1;
    recoverySequence.current += 1;
    inFlight.current = false;
    setTest({status: 'idle'});
    setRecovery('idle');
    recovering.current = false;
    return () => {
      sequence.current += 1;
      recoverySequence.current += 1;
    };
  }, [sourceKey]);
  const currentTest =
    test.status !== 'idle' && test.sourceKey === sourceKey ? test : undefined;
  const testing = currentTest?.status === 'testing';
  const result =
    currentTest?.status === 'done' ? currentTest.result : undefined;
  const configured = connection
    ? connection.status !== 'not-configured'
    : source.status === 'connected';
  const lastDate = !configured
    ? undefined
    : result?.status === 'connected'
    ? result.latestEntryDate
    : connection?.latestEntryDate;
  const validDate =
    typeof lastDate === 'number' &&
    Number.isFinite(new Date(lastDate).getTime()) &&
    lastDate > 0
      ? lastDate
      : undefined;
  const stale =
    validDate !== undefined && Date.now() - validDate >= 10 * 60 * 1000;
  const status = connectionStatusText(
    copy,
    testing,
    configured,
    result,
    connection?.status,
  );
  const testConnection = async () => {
    if (inFlight.current || recovering.current || !configured) {
      return;
    }
    if (!connection) {
      onEdit?.();
      return;
    }
    inFlight.current = true;
    const request = ++sequence.current;
    setTest({status: 'testing', sourceKey});
    let next: SettingsNightscoutTestResult;
    try {
      next = await connection.testConnection();
    } catch {
      next = {status: 'failed', reason: 'unknown'};
    }
    if (request === sequence.current) {
      inFlight.current = false;
      setTest({status: 'done', sourceKey, result: next});
    }
  };
  const recover = async () => {
    if (recovering.current || inFlight.current || !connection?.recovery) {
      return;
    }
    recovering.current = true;
    const request = ++recoverySequence.current;
    setRecovery('restoring');
    try {
      await connection.recovery.recover();
      if (request === recoverySequence.current) {
        setRecovery('done');
      }
    } catch {
      if (request === recoverySequence.current) {
        setRecovery('failed');
      }
    } finally {
      if (request === recoverySequence.current) {
        recovering.current = false;
      }
    }
  };
  return (
    <View style={styles.card} testID="settings-nightscout-card">
      <Text
        accessibilityRole="header"
        style={[styles.title, rtl && styles.rtl]}>
        Nightscout
      </Text>
      {configured && source.displayLabel ? (
        <Text style={[styles.text, rtl && styles.rtl]}>
          {source.displayLabel}
        </Text>
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.text, rtl && styles.rtl]}
        testID="settings-nightscout-status">
        {status}
      </Text>
      {configured ? (
        <Text style={[styles.muted, rtl && styles.rtl]}>
          {source.credentialConfigured
            ? copy.credential
            : copy.credentialMissing}
        </Text>
      ) : null}
      {validDate !== undefined ? (
        <Text
          style={[styles.muted, rtl && styles.rtl]}
          testID="settings-nightscout-latest">
          {copy.latest}:{' '}
          {new Date(validDate).toLocaleString(
            locale === 'he' ? 'he-IL' : 'en-US',
          )}
        </Text>
      ) : null}
      {stale ? (
        <Text
          style={[styles.text, rtl && styles.rtl]}
          testID="settings-nightscout-stale">
          {copy.stale}
        </Text>
      ) : null}
      <View style={[styles.actions, rtl && styles.reverse]}>
        {configured && (connection || onEdit) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: testing || recovery === 'restoring',
              busy: testing,
            }}
            disabled={testing || recovery === 'restoring'}
            onPress={testConnection}
            style={[styles.button, testing && styles.disabled]}
            testID="settings-test-nightscout">
            {testing ? (
              <ActivityIndicator color={theme.buttonTextColor} />
            ) : null}
            <Text style={styles.buttonText}>
              {testing ? copy.testing : copy.test}
            </Text>
          </Pressable>
        ) : null}
        {onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{disabled: recovery === 'restoring'}}
            disabled={recovery === 'restoring'}
            onPress={onEdit}
            style={styles.secondaryButton}
            testID="settings-manage-nightscout">
            <Text style={styles.secondaryText}>
              {configured ? copy.edit : copy.add}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {connection?.recovery && connection.recovery.count > 0 ? (
        <NightscoutRecoveryPanel
          count={connection.recovery.count}
          locale={locale}
          state={recovery}
          disabled={testing}
          styles={styles}
          onConfirm={recover}
          onCancel={() => setRecovery('idle')}
          onBegin={() => setRecovery('confirm')}
        />
      ) : null}
    </View>
  );
};

const NightscoutRecoveryPanel = ({
  count,
  locale,
  state,
  disabled,
  styles,
  onBegin,
  onCancel,
  onConfirm,
}: {
  readonly count: number;
  readonly locale: DestinationLocale;
  readonly state: RecoveryState;
  readonly disabled: boolean;
  readonly styles: ReturnType<typeof createStyles>;
  readonly onBegin: () => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  let content: React.ReactNode;
  if (state === 'confirm') {
    content = (
      <>
        <Text
          accessibilityRole="alert"
          style={[styles.text, rtl && styles.rtl]}>
          {copy.confirm}
        </Text>
        <View style={[styles.actions, rtl && styles.reverse]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{disabled}}
            disabled={disabled}
            onPress={onConfirm}
            style={styles.button}
            testID="settings-nightscout-confirm-recovery">
            <Text style={styles.buttonText}>{copy.confirmRestore}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.secondaryButton}
            testID="settings-nightscout-cancel-recovery">
            <Text style={styles.secondaryText}>{copy.cancel}</Text>
          </Pressable>
        </View>
      </>
    );
  } else if (state === 'restoring') {
    content = (
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.text, rtl && styles.rtl]}>
        {copy.restoring}
      </Text>
    );
  } else {
    content = (
      <>
        {state === 'failed' || state === 'done' ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.text, rtl && styles.rtl]}
            testID="settings-nightscout-recovery-result">
            {state === 'failed' ? copy.recoveryFailed : copy.recovered}
          </Text>
        ) : null}
        {state !== 'done' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{disabled}}
            disabled={disabled}
            onPress={onBegin}
            style={styles.secondaryButton}
            testID="settings-nightscout-recover">
            <Text style={styles.secondaryText}>{copy.restore}</Text>
          </Pressable>
        ) : null}
      </>
    );
  }
  return (
    <View style={styles.recovery} testID="settings-nightscout-recovery">
      <Text style={[styles.text, rtl && styles.rtl]}>
        {copy.recovery(count)}
      </Text>
      {content}
    </View>
  );
};

const createStyles = (theme: ThemeType) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.white,
      borderColor: theme.borderColor,
      borderWidth: 1,
      borderRadius: theme.borderRadius * 2,
      padding: theme.spacing.lg,
      marginTop: theme.spacing.md,
    },
    title: {
      fontFamily: theme.fontFamily,
      color: theme.textColor,
      fontSize: theme.typography.size.lg,
      fontWeight: '800',
    },
    text: {
      fontFamily: theme.fontFamily,
      color: theme.textColor,
      fontSize: theme.typography.size.sm,
      marginTop: theme.spacing.sm,
      lineHeight: 22,
    },
    muted: {
      fontFamily: theme.fontFamily,
      color: theme.textColor,
      fontSize: theme.typography.size.xs,
      marginTop: theme.spacing.sm,
      lineHeight: 20,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
    },
    recovery: {
      marginTop: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.borderColor,
      paddingTop: theme.spacing.sm,
    },
    button: {
      minHeight: 48,
      flexDirection: 'row',
      gap: theme.spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.buttonBackgroundColor,
      borderRadius: theme.borderRadius,
      padding: theme.spacing.md,
    },
    buttonText: {
      fontFamily: theme.fontFamily,
      color: theme.buttonTextColor,
      fontWeight: '700',
      fontSize: theme.typography.size.sm,
    },
    secondaryButton: {
      minHeight: 48,
      justifyContent: 'center',
      borderColor: theme.borderColor,
      borderWidth: 1,
      borderRadius: theme.borderRadius,
      padding: theme.spacing.md,
    },
    secondaryText: {
      fontFamily: theme.fontFamily,
      color: theme.textColor,
      fontWeight: '700',
      fontSize: theme.typography.size.sm,
    },
    rtl: {textAlign: 'right', writingDirection: 'rtl'},
    reverse: {flexDirection: 'row-reverse'},
    disabled: {opacity: 0.65},
  });
