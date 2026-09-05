import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  SettingsCommand,
  SettingsDataSource,
  SettingsOverview,
} from '../../modules/settings';
import {SettingsDataSourceError} from '../../modules/settings';
import type {DestinationLocale} from '../destinations';
import {ProductPage, ProductSection, productUiTokens} from '../ui';
import type {
  SettingsLinkedSection,
  SettingsNightscoutConnectionRuntime,
} from './runtime';
import {NightscoutConnectionCard} from './NightscoutConnectionCard';

const COPY = {
  en: {
    title: 'Settings',
    subtitle: 'Connections, preferences, and clear status in one place.',
    loading: 'Loading settings…',
    loadFailed: 'Settings could not be loaded.',
    retry: 'Try again',
    saving: 'Saving…',
    saveFailed: 'The change could not be saved. Try again.',
    shortcutLimit: 'Only two navigation shortcuts can be active.',
    customizeTitle: 'Make it yours',
    customizeDescription:
      'Choose favorites, the start view, and the layout for this screen size.',
    customize: 'Customize',
    favorites: 'favorites',
    columns: 'columns',
    phone: 'Phone',
    tablet: 'Tablet',
    desktop: 'Desktop',
    hubOptions: 'Hub and navigation',
    currentSnapshot: 'Show current snapshot',
    recents: 'Show recent modules',
    gri: 'Show advanced GRI metric',
    chatShortcut: 'Keep Chat shortcut',
    updatesShortcut: 'Keep Updates shortcut',
    language: 'Language',
    english: 'English',
    hebrew: 'עברית',
    connections: 'Connections and account',
    account: 'Google account',
    signedIn: 'Signed in',
    signedOut: 'Not signed in',
    manageAccount: 'Manage account',
    nightscout: 'Nightscout',
    connected: 'Connected',
    notConnected: 'Not connected',
    configuredHere: 'Configured on this device',
    credentialMissing: 'Credential not configured',
    manageConnection: 'Manage connection',
    ai: 'AI analyst',
    aiDescription:
      'AI can explain data and suggest actions. It cannot change therapy or Nightscout.',
    advisory: 'Advisory only',
    aiEnabled: 'Enable AI analyst',
    manageAiKey: 'Manage API key',
    preMealTitle: 'Before meals',
    preMealDescription:
      'Show a factual, optional card in the Day Graph after you say you are planning a meal.',
    preMealEnabled: 'Enable pre-meal assistance',
    preMealNotifications: 'Allow pre-meal notifications',
    preMealNotificationsHint:
      'Notifications require a separate opt-in and are off by default.',
    offline: 'Offline data',
    offlineReady: 'Meals and activities work from local data first.',
    offlineSyncing: 'Local data is ready and changes are syncing.',
    offlineMode: 'Offline. Local changes will sync when a connection returns.',
    offlineUnavailable:
      'Choose an account and Workspace to use local Journal data.',
    noPending: 'Everything is synced',
    onePending: '1 change waiting to sync',
    pending: 'changes waiting to sync',
    alerts: 'Alerts',
    alertsDescription: 'Choose glucose alert rules and active times.',
    manageAlerts: 'Manage alert rules',
    security: 'Security and diagnostics',
    securityDescription:
      'Credentials are never displayed here. Only their configuration status is shown.',
    diagnostics: 'Open diagnostics',
  },
  he: {
    title: 'הגדרות',
    subtitle: 'חיבורים, העדפות ומצב ברור במקום אחד.',
    loading: 'טוען הגדרות…',
    loadFailed: 'לא הצלחנו לטעון את ההגדרות.',
    retry: 'ניסיון נוסף',
    saving: 'שומר…',
    saveFailed: 'לא הצלחנו לשמור את השינוי. אפשר לנסות שוב.',
    shortcutLimit: 'אפשר להפעיל רק שני קיצורי ניווט.',
    customizeTitle: 'מתאימים את האפליקציה',
    customizeDescription:
      'בחירת מועדפים, מסך פתיחה וסידור שמתאים לגודל המסך הזה.',
    customize: 'התאמה אישית',
    favorites: 'מועדפים',
    columns: 'עמודות',
    phone: 'טלפון',
    tablet: 'טאבלט',
    desktop: 'מחשב',
    hubOptions: 'המרכז והניווט',
    currentSnapshot: 'הצגת תמונת מצב נוכחית',
    recents: 'הצגת מודולים אחרונים',
    gri: 'הצגת מדד GRI מתקדם',
    chatShortcut: 'השארת קיצור לצ׳אט',
    updatesShortcut: 'השארת קיצור לעדכונים',
    language: 'שפה',
    english: 'English',
    hebrew: 'עברית',
    connections: 'חיבורים וחשבון',
    account: 'חשבון Google',
    signedIn: 'מחובר',
    signedOut: 'לא מחובר',
    manageAccount: 'ניהול החשבון',
    nightscout: 'Nightscout',
    connected: 'מחובר',
    notConnected: 'לא מחובר',
    configuredHere: 'מוגדר במכשיר הזה',
    credentialMissing: 'לא הוגדר מפתח גישה',
    manageConnection: 'ניהול החיבור',
    ai: 'AI Analyst',
    aiDescription:
      'ה־AI יכול להסביר נתונים ולהציע פעולות. הוא לא משנה טיפול או נתונים ב־Nightscout.',
    advisory: 'לייעוץ בלבד',
    aiEnabled: 'הפעלת AI Analyst',
    manageAiKey: 'ניהול מפתח API',
    preMealTitle: 'לפני ארוחות',
    preMealDescription:
      'הצגת כרטיס עובדתי ואופציונלי בגרף היומי לאחר סימון שמתכננים ארוחה.',
    preMealEnabled: 'הפעלת סיוע לפני ארוחה',
    preMealNotifications: 'אישור התראות לפני ארוחה',
    preMealNotificationsHint: 'התראות דורשות אישור נפרד וכבויות כברירת מחדל.',
    offline: 'מידע ללא חיבור',
    offlineReady: 'ארוחות ופעילויות עובדות קודם מהמידע המקומי.',
    offlineSyncing: 'המידע המקומי זמין והשינויים מסתנכרנים.',
    offlineMode: 'אין חיבור. השינויים המקומיים יסתנכרנו כשהחיבור יחזור.',
    offlineUnavailable: 'יש לבחור חשבון וסביבת עבודה כדי להשתמש ביומן המקומי.',
    noPending: 'הכול מסונכרן',
    onePending: 'שינוי אחד ממתין לסנכרון',
    pending: 'שינויים ממתינים לסנכרון',
    alerts: 'התראות',
    alertsDescription: 'בחירת כללי התראת סוכר והזמנים שבהם הם פעילים.',
    manageAlerts: 'ניהול כללי התראות',
    security: 'אבטחה ואבחון',
    securityDescription:
      'פרטי גישה לעולם אינם מוצגים כאן. מוצג רק האם הם מוגדרים.',
    diagnostics: 'פתיחת אבחון טכני',
  },
} as const;

type LoadState =
  | {readonly status: 'loading'}
  | {readonly status: 'error'}
  | {readonly status: 'ready'; readonly overview: SettingsOverview};

export interface SettingsModuleViewProps {
  readonly dataSource: SettingsDataSource;
  readonly locale: DestinationLocale;
  readonly onCustomize?: () => void;
  readonly onOpenSection?: (section: SettingsLinkedSection) => void;
  readonly nightscoutConnection?: SettingsNightscoutConnectionRuntime;
}

const ActionButton = ({
  label,
  testID,
  onPress,
}: {
  readonly label: string;
  readonly testID?: string;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={({pressed}) => [styles.actionButton, pressed && styles.pressed]}
    {...(testID === undefined ? {} : {testID})}>
    <Text style={styles.actionButtonLabel}>{label}</Text>
  </Pressable>
);

const ToggleRow = ({
  label,
  enabled,
  disabled,
  rtl,
  testID,
  onPress,
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly disabled: boolean;
  readonly rtl: boolean;
  readonly testID: string;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityState={{checked: enabled, disabled}}
    disabled={disabled}
    onPress={onPress}
    style={({pressed}) => [
      styles.toggleRow,
      rtl && styles.rowReverse,
      disabled && styles.disabled,
      pressed && !disabled && styles.pressed,
    ]}
    testID={testID}>
    <Text style={[styles.rowLabel, rtl && styles.rtlText]}>{label}</Text>
    <View style={[styles.switchTrack, enabled && styles.switchTrackOn]}>
      <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
    </View>
  </Pressable>
);

const StatusCard = ({
  icon,
  title,
  lines,
  rtl,
  action,
}: {
  readonly icon: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly rtl: boolean;
  readonly action?: React.ReactNode;
}) => (
  <View style={styles.card}>
    <View style={[styles.cardHeader, rtl && styles.rowReverse]}>
      <View style={styles.iconCircle}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <View style={styles.cardCopy}>
        <Text style={[styles.cardTitle, rtl && styles.rtlText]}>{title}</Text>
        {lines.map((line, index) => (
          <Text
            key={`${line}-${index}`}
            style={[styles.cardLine, rtl && styles.rtlText]}>
            {line}
          </Text>
        ))}
      </View>
    </View>
    {action}
  </View>
);

export const SettingsModuleView = ({
  dataSource,
  locale,
  onCustomize,
  onOpenSection,
  nightscoutConnection,
}: SettingsModuleViewProps) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [state, setState] = useState<LoadState>({status: 'loading'});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const requestSequence = useRef(0);

  const load = () => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setState({status: 'loading'});
    setSaving(false);
    setActionError(undefined);
    const controller = new AbortController();
    dataSource.load({signal: controller.signal}).then(
      overview => {
        if (requestSequence.current === sequence) {
          setState({status: 'ready', overview});
        }
      },
      () => {
        if (requestSequence.current === sequence) {
          setState({status: 'error'});
        }
      },
    );
    return () => controller.abort();
  };

  useEffect(() => {
    const cancel = load();
    return () => {
      requestSequence.current += 1;
      cancel();
    };
    // Loading is keyed by the stable adapter identity supplied by the host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource]);

  const apply = async (command: SettingsCommand) => {
    if (saving) {
      return;
    }
    const sourceSequence = requestSequence.current;
    setSaving(true);
    setActionError(undefined);
    try {
      const overview = await dataSource.apply(command);
      if (requestSequence.current === sourceSequence) {
        setState({status: 'ready', overview});
      }
    } catch (error) {
      if (requestSequence.current === sourceSequence) {
        setActionError(
          error instanceof SettingsDataSourceError &&
            error.code === 'shortcut-limit'
            ? copy.shortcutLimit
            : copy.saveFailed,
        );
      }
    } finally {
      if (requestSequence.current === sourceSequence) {
        setSaving(false);
      }
    }
  };

  if (state.status === 'loading') {
    return (
      <View style={styles.stateCard} testID="settings-loading">
        <ActivityIndicator color={productUiTokens.colors.action} />
        <Text style={[styles.stateText, rtl && styles.rtlText]}>
          {copy.loading}
        </Text>
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={styles.stateCard} testID="settings-error">
        <Text accessibilityRole="alert" style={styles.errorText}>
          {copy.loadFailed}
        </Text>
        <ActionButton
          label={copy.retry}
          onPress={() => load()}
          testID="settings-retry"
        />
      </View>
    );
  }

  const {overview} = state;
  const profileLabel =
    overview.layout.profile === 'phone'
      ? copy.phone
      : overview.layout.profile === 'tablet'
      ? copy.tablet
      : copy.desktop;
  const pendingLabel =
    overview.offline.pendingWrites === 0
      ? copy.noPending
      : overview.offline.pendingWrites === 1
      ? copy.onePending
      : `${overview.offline.pendingWrites} ${copy.pending}`;
  const offlineDescription =
    overview.offline.status === 'ready'
      ? copy.offlineReady
      : overview.offline.status === 'syncing'
      ? copy.offlineSyncing
      : overview.offline.status === 'offline'
      ? copy.offlineMode
      : copy.offlineUnavailable;

  return (
    <View
      style={[styles.root, rtl && styles.rtlRoot]}
      testID="settings-module-view">
      <ProductPage
        locale={locale}
        subtitle={copy.subtitle}
        testID="settings-page"
        title={copy.title}>
        <NightscoutConnectionCard
          source={overview.nightscout}
          locale={locale}
          {...(nightscoutConnection === undefined
            ? {}
            : {connection: nightscoutConnection})}
          {...(onOpenSection === undefined
            ? {}
            : {onEdit: () => onOpenSection('nightscout')})}
        />
        <View style={styles.featuredCard}>
          <Text style={[styles.featuredTitle, rtl && styles.rtlText]}>
            {copy.customizeTitle}
          </Text>
          <Text style={[styles.featuredDescription, rtl && styles.rtlText]}>
            {copy.customizeDescription}
          </Text>
          <Text style={[styles.featuredMeta, rtl && styles.rtlText]}>
            {`${profileLabel} · ${overview.layout.columns} ${copy.columns} · ${overview.personalization.favoritesCount} ${copy.favorites}`}
          </Text>
          {onCustomize ? (
            <ActionButton
              label={copy.customize}
              onPress={onCustomize}
              testID="settings-customize"
            />
          ) : null}
        </View>

        <ProductSection locale={locale} title={copy.hubOptions}>
          <View style={styles.card}>
            <ToggleRow
              disabled={saving}
              enabled={overview.personalization.showCurrentSnapshot}
              label={copy.currentSnapshot}
              onPress={() =>
                apply({
                  kind: 'set-layout-option',
                  option: 'show-current-snapshot',
                  enabled: !overview.personalization.showCurrentSnapshot,
                })
              }
              rtl={rtl}
              testID="settings-toggle-current-snapshot"
            />
            <ToggleRow
              disabled={saving}
              enabled={overview.personalization.showRecents}
              label={copy.recents}
              onPress={() =>
                apply({
                  kind: 'set-layout-option',
                  option: 'show-recents',
                  enabled: !overview.personalization.showRecents,
                })
              }
              rtl={rtl}
              testID="settings-toggle-recents"
            />
            <ToggleRow
              disabled={saving}
              enabled={overview.personalization.showGri}
              label={copy.gri}
              onPress={() =>
                apply({
                  kind: 'set-layout-option',
                  option: 'show-gri',
                  enabled: !overview.personalization.showGri,
                })
              }
              rtl={rtl}
              testID="settings-toggle-gri"
            />
            <ToggleRow
              disabled={saving}
              enabled={overview.personalization.chatShortcut}
              label={copy.chatShortcut}
              onPress={() =>
                apply({
                  kind: 'set-shortcut',
                  shortcut: 'chat',
                  enabled: !overview.personalization.chatShortcut,
                })
              }
              rtl={rtl}
              testID="settings-toggle-chat-shortcut"
            />
            <ToggleRow
              disabled={saving}
              enabled={overview.personalization.updatesShortcut}
              label={copy.updatesShortcut}
              onPress={() =>
                apply({
                  kind: 'set-shortcut',
                  shortcut: 'updates',
                  enabled: !overview.personalization.updatesShortcut,
                })
              }
              rtl={rtl}
              testID="settings-toggle-updates-shortcut"
            />
          </View>
        </ProductSection>

        <ProductSection locale={locale} title={copy.language}>
          <View style={[styles.languageRow, rtl && styles.rowReverse]}>
            {(['en', 'he'] as const).map(language => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{
                  checked: overview.language === language,
                  disabled: saving,
                }}
                disabled={saving}
                key={language}
                onPress={() => apply({kind: 'set-language', language})}
                style={({pressed}) => [
                  styles.languageOption,
                  overview.language === language && styles.languageSelected,
                  pressed && styles.pressed,
                ]}
                testID={`settings-language-${language}`}>
                <Text
                  style={[
                    styles.languageLabel,
                    overview.language === language &&
                      styles.languageLabelSelected,
                  ]}>
                  {language === 'en' ? copy.english : copy.hebrew}
                </Text>
              </Pressable>
            ))}
          </View>
        </ProductSection>

        <ProductSection locale={locale} title={copy.connections}>
          <View style={styles.cardGrid}>
            <StatusCard
              action={
                onOpenSection ? (
                  <ActionButton
                    label={copy.manageAccount}
                    onPress={() => onOpenSection('account')}
                    testID="settings-manage-account"
                  />
                ) : undefined
              }
              icon="👤"
              lines={[
                overview.account.status === 'signed-in'
                  ? copy.signedIn
                  : copy.signedOut,
                ...(overview.account.displayLabel
                  ? [overview.account.displayLabel]
                  : []),
              ]}
              rtl={rtl}
              title={copy.account}
            />
          </View>
        </ProductSection>

        <ProductSection locale={locale} title={copy.ai}>
          <View style={styles.card}>
            <Text style={[styles.cardLine, rtl && styles.rtlText]}>
              {copy.aiDescription}
            </Text>
            <Text style={[styles.advisory, rtl && styles.rtlText]}>
              {copy.advisory}
            </Text>
            <ToggleRow
              disabled={saving}
              enabled={overview.ai.enabled}
              label={copy.aiEnabled}
              onPress={() =>
                apply({kind: 'set-ai-enabled', enabled: !overview.ai.enabled})
              }
              rtl={rtl}
              testID="settings-toggle-ai"
            />
            <Text style={[styles.cardLine, rtl && styles.rtlText]}>
              {overview.ai.credentialConfigured
                ? copy.configuredHere
                : copy.credentialMissing}
            </Text>
            {onOpenSection ? (
              <ActionButton
                label={copy.manageAiKey}
                onPress={() => onOpenSection('ai-credentials')}
                testID="settings-manage-ai-key"
              />
            ) : null}
          </View>
        </ProductSection>

        <ProductSection locale={locale} title={copy.preMealTitle}>
          <View style={styles.card}>
            <Text style={[styles.cardLine, rtl && styles.rtlText]}>
              {copy.preMealDescription}
            </Text>
            <ToggleRow
              disabled={saving}
              enabled={overview.preMealAssistance.enabled}
              label={copy.preMealEnabled}
              onPress={() =>
                apply({
                  kind: 'set-pre-meal-assistance',
                  option: 'card',
                  enabled: !overview.preMealAssistance.enabled,
                })
              }
              rtl={rtl}
              testID="settings-toggle-pre-meal-card"
            />
            <ToggleRow
              disabled={saving || !overview.preMealAssistance.enabled}
              enabled={overview.preMealAssistance.notificationsEnabled}
              label={copy.preMealNotifications}
              onPress={() =>
                apply({
                  kind: 'set-pre-meal-assistance',
                  option: 'notifications',
                  enabled: !overview.preMealAssistance.notificationsEnabled,
                })
              }
              rtl={rtl}
              testID="settings-toggle-pre-meal-notifications"
            />
            <Text style={[styles.cardLine, rtl && styles.rtlText]}>
              {copy.preMealNotificationsHint}
            </Text>
          </View>
        </ProductSection>

        <ProductSection locale={locale} title={copy.offline}>
          <StatusCard
            icon="↻"
            lines={[offlineDescription, pendingLabel]}
            rtl={rtl}
            title={copy.offline}
          />
        </ProductSection>

        <ProductSection locale={locale} title={copy.alerts}>
          <StatusCard
            action={
              onOpenSection ? (
                <ActionButton
                  label={copy.manageAlerts}
                  onPress={() => onOpenSection('alerts')}
                  testID="settings-manage-alerts"
                />
              ) : undefined
            }
            icon="🔔"
            lines={[copy.alertsDescription]}
            rtl={rtl}
            title={copy.alerts}
          />
        </ProductSection>

        <ProductSection locale={locale} title={copy.security}>
          <View style={styles.securityCard}>
            <Text style={[styles.cardLine, rtl && styles.rtlText]}>
              {copy.securityDescription}
            </Text>
            {onOpenSection ? (
              <ActionButton
                label={copy.diagnostics}
                onPress={() => onOpenSection('diagnostics')}
                testID="settings-open-diagnostics"
              />
            ) : null}
          </View>
        </ProductSection>

        {saving ? (
          <Text style={[styles.savingText, rtl && styles.rtlText]}>
            {copy.saving}
          </Text>
        ) : null}
        {actionError ? (
          <Text
            accessibilityRole="alert"
            style={[styles.errorText, rtl && styles.rtlText]}
            testID="settings-action-error">
            {actionError}
          </Text>
        ) : null}
      </ProductPage>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  rtlRoot: {direction: 'rtl'},
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  rowReverse: {flexDirection: 'row-reverse'},
  pressed: {opacity: productUiTokens.opacity.pressed},
  disabled: {opacity: productUiTokens.opacity.disabled},
  stateCard: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.page,
    flex: 1,
    justifyContent: 'center',
    padding: productUiTokens.spacing.xl,
  },
  stateText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 15,
    marginTop: productUiTokens.spacing.sm,
  },
  errorText: {
    color: productUiTokens.colors.danger,
    fontSize: 14,
    fontWeight: '700',
    marginTop: productUiTokens.spacing.md,
  },
  featuredCard: {
    backgroundColor: '#1769AA',
    borderRadius: productUiTokens.radii.featuredCard,
    marginTop: productUiTokens.spacing.lg,
    padding: productUiTokens.spacing.lg,
  },
  featuredTitle: {
    color: productUiTokens.colors.actionText,
    fontSize: 21,
    fontWeight: '800',
  },
  featuredDescription: {
    color: productUiTokens.colors.actionTextMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: productUiTokens.spacing.xs,
  },
  featuredMeta: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: productUiTokens.spacing.md,
  },
  card: {
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.card,
    borderWidth: 1,
    marginBottom: productUiTokens.spacing.md,
    padding: productUiTokens.spacing.md,
  },
  cardGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  cardHeader: {alignItems: 'flex-start', flexDirection: 'row'},
  cardCopy: {flex: 1},
  iconCircle: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    marginHorizontal: productUiTokens.spacing.sm,
    width: 42,
  },
  iconText: {fontSize: 19},
  cardTitle: {
    color: productUiTokens.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  cardLine: {
    color: productUiTokens.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  advisory: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: productUiTokens.radii.pill,
    color: '#17613A',
    fontSize: 12,
    fontWeight: '800',
    marginTop: productUiTokens.spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: productUiTokens.spacing.md,
    paddingVertical: 6,
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomColor: productUiTokens.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingVertical: productUiTokens.spacing.xs,
  },
  rowLabel: {
    color: productUiTokens.colors.text,
    flex: 1,
    fontSize: 15,
    marginHorizontal: productUiTokens.spacing.sm,
  },
  switchTrack: {
    backgroundColor: '#CBD5E1',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    padding: 3,
    width: 50,
  },
  switchTrackOn: {backgroundColor: '#16A34A'},
  switchThumb: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 24,
    width: 24,
  },
  switchThumbOn: {alignSelf: 'flex-end'},
  actionButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: productUiTokens.colors.action,
    borderRadius: productUiTokens.radii.pill,
    justifyContent: 'center',
    marginTop: productUiTokens.spacing.md,
    minHeight: 42,
    paddingHorizontal: productUiTokens.spacing.lg,
  },
  actionButtonLabel: {
    color: productUiTokens.colors.actionText,
    fontSize: 14,
    fontWeight: '800',
  },
  languageRow: {flexDirection: 'row', gap: 10},
  languageOption: {
    alignItems: 'center',
    backgroundColor: productUiTokens.colors.surface,
    borderColor: productUiTokens.colors.border,
    borderRadius: productUiTokens.radii.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  languageSelected: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderColor: productUiTokens.colors.action,
  },
  languageLabel: {color: productUiTokens.colors.text, fontWeight: '700'},
  languageLabelSelected: {color: productUiTokens.colors.action},
  securityCard: {
    backgroundColor: productUiTokens.colors.surfaceInfo,
    borderRadius: productUiTokens.radii.card,
    padding: productUiTokens.spacing.md,
  },
  savingText: {
    color: productUiTokens.colors.textMuted,
    fontSize: 13,
    marginTop: productUiTokens.spacing.md,
  },
});
