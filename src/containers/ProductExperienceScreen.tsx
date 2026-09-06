import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {getApp} from '@react-native-firebase/app';
import {getAuth, signOut as firebaseSignOut} from '@react-native-firebase/auth';
import {GoogleSignin as GoogleIdentity} from '@react-native-google-signin/google-signin';
import type {NavigationProp} from '@react-navigation/native';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {useNightscoutConfig} from 'app/contexts/NightscoutConfigContext';
import {useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {useAiSettings} from 'app/contexts/AiSettingsContext';
import {useProactiveCareSettings} from 'app/contexts/ProactiveCareSettingsContext';
import {NIGHTSCOUT_SETUP_SCREEN} from 'app/constants/SCREEN_NAMES';
import {ProductExperience} from 'app/product/app';
import {coreDestinationRegistry} from 'app/product/destinations';
import type {DestinationRuntimeContext} from 'app/product/destinations';
import {selectCurrentSnapshotTarget} from 'app/product/hub';
import {useNativeJournalWorkspace} from 'app/platform/native/journal';
import {nativeMealImagesRuntime} from 'app/platform/native/mealMedia';
import {
  createNativeAlertRulesRepository,
  createNativeUpdateCenterRepository,
  activateNativeAlertSynchronization,
} from 'app/platform/native/alerts/nativeOfflineAlertRepositories';
import {
  createCurrentSnapshotViewModel,
  createNativeDayGraphDataSource,
  createNativeDayGraphTimelineLoader,
  createNativeDailyInsulinSummaryLoader,
  createNativeDailyOverviewDataSource,
  createNativePreviousDaySummaryDataSource,
  createNativeLoopChangesDataSource,
  createNativePreMealAssistanceDataSource,
  createNativePreMealIntentStore,
  decodeNativeProductNavigationIntent,
  createNativeTherapyContextDataSource,
  createNativeTrendsDataSource,
  useLatestNightscoutSnapshotState,
  type NativePreMealIntent,
} from 'app/platform/native/product';
import {
  getPersonalizationLayout,
  type ProductPersonalizationChange,
} from 'app/product/personalization';
import {useRefreshingNow} from 'app/product/time';
import {useNativeProductPersonalization} from 'app/platform/native/personalization';
import {
  createNativeSettingsDataSource,
  createNativeNightscoutSettingsConnection,
} from 'app/platform/native/settings';
import {
  SettingsDetailView,
  type SettingsDetailSection,
} from 'app/product/settings';
import {useLegacyAiAnalystModuleRuntime} from 'app/platform/native/ai';
import {sha1WorkspaceIdentityDigest} from 'app/modules/workspaces';
import {useGlucoseRuleNotifications} from 'app/hooks/useGlucoseRuleNotifications';
import {unregisterDeviceToken} from 'app/services/rebaseService';
import {usePreMealNotifications} from 'app/hooks/usePreMealNotifications';
import {useProactiveCareUpdateCenter} from 'app/hooks/useProactiveCareUpdateCenter';

type RootNavigation = NavigationProp<Record<string, object | undefined>>;

const EMPTY_OUTBOX = [] as const;
const subscribeToNothing = (): (() => void) => () => undefined;
const getEmptyOutbox = () => EMPTY_OUTBOX;

const ProductExperienceScreen = ({
  navigation,
  route,
}: {
  readonly navigation: RootNavigation;
  readonly route: {readonly params?: {readonly productIntent?: unknown}};
}) => {
  const {language, setLanguage} = useAppLanguage();
  const {
    activeProfile,
    isLoaded: nightscoutLoaded,
    testProfileConnection,
    pendingLegacyProfileCount,
    recoverLegacyProfiles,
  } = useNightscoutConfig();
  const {settings: glucoseSettings} = useGlucoseSettings();
  const {settings: aiSettings, setSetting: setAiSetting} = useAiSettings();
  const {settings: proactiveCareSettings, setSetting: setProactiveCareSetting} =
    useProactiveCareSettings();
  const [preMealIntent, setPreMealIntent] = useState<
    NativePreMealIntent | undefined
  >();
  const [settingsDetail, setSettingsDetail] = useState<
    SettingsDetailSection | undefined
  >();
  const {width, height} = useWindowDimensions();
  const firebaseUser = getAuth(getApp()).currentUser;
  const firebaseUserId = firebaseUser?.uid;
  const accountDisplayLabel =
    firebaseUser?.displayName?.trim() || firebaseUser?.email?.trim();
  const journal = useNativeJournalWorkspace({
    ...(firebaseUserId === undefined ? {} : {firebaseUserId}),
    ...(activeProfile?.baseUrl === undefined
      ? {}
      : {nightscoutBaseUrl: activeProfile.baseUrl}),
  });
  const latestNightscoutSnapshotState = useLatestNightscoutSnapshotState();
  const nightscoutConnection = useMemo(
    () =>
      createNativeNightscoutSettingsConnection({
        sourceKey: sha1WorkspaceIdentityDigest.digest(
          [
            firebaseUserId ?? '',
            activeProfile?.id ?? '',
            activeProfile?.baseUrl ?? '',
            activeProfile?.apiSecretSha1 ?? '',
          ].join('|'),
        ),
        profile: activeProfile,
        isLoaded: nightscoutLoaded,
        snapshot: latestNightscoutSnapshotState,
        testProfileConnection,
        ...(firebaseUserId && pendingLegacyProfileCount > 0
          ? {
              recovery: {
                count: pendingLegacyProfileCount,
                recover: recoverLegacyProfiles,
              },
            }
          : {}),
      }),
    [
      activeProfile,
      firebaseUserId,
      latestNightscoutSnapshotState,
      nightscoutLoaded,
      testProfileConnection,
      pendingLegacyProfileCount,
      recoverLegacyProfiles,
    ],
  );
  const currentTime = useRefreshingNow();
  const runtime = useMemo<DestinationRuntimeContext>(
    () => ({
      platform:
        Platform.OS === 'web'
          ? 'web'
          : Platform.OS === 'ios'
          ? 'ios'
          : 'android',
    }),
    [],
  );
  const navigationIntent = useMemo(
    () =>
      decodeNativeProductNavigationIntent(
        route.params?.productIntent,
        coreDestinationRegistry,
        runtime,
      ),
    [route.params?.productIntent, runtime],
  );
  const activeSourceRevision = activeProfile
    ? sha1WorkspaceIdentityDigest.digest(activeProfile.baseUrl)
    : undefined;
  // A source switch must create a new adapter identity so every active Trends
  // view cancels its old request and reloads against the new Workspace source.
  const trendsDataSource = useMemo(
    () =>
      createNativeTrendsDataSource({
        ...(activeSourceRevision === undefined
          ? {}
          : {sourceRevision: activeSourceRevision}),
      }),
    [activeSourceRevision],
  );
  const insulinSummaryLoader = useMemo(
    () =>
      createNativeDailyInsulinSummaryLoader({
        ...(activeSourceRevision === undefined
          ? {}
          : {sourceRevision: activeSourceRevision}),
      }),
    [activeSourceRevision],
  );
  const dailyOverviewDataSource = useMemo(
    () =>
      createNativeDailyOverviewDataSource({
        glucoseDataSource: trendsDataSource,
        loadInsulinSummary: insulinSummaryLoader,
      }),
    [insulinSummaryLoader, trendsDataSource],
  );
  const dailyOverviewRuntime = useMemo(
    () => ({
      dataSource: dailyOverviewDataSource,
      thresholds: {
        veryLowMaxMgDl: glucoseSettings.severeHypo,
        targetMinMgDl: glucoseSettings.hypo,
        targetMaxMgDl: glucoseSettings.hyper,
        highMaxMgDl: glucoseSettings.severeHyper,
      },
    }),
    [dailyOverviewDataSource, glucoseSettings],
  );
  const activeJournalWorkspace =
    journal.status === 'ready' ? journal.workspace : undefined;
  const therapyContextDataSource = useMemo(
    () =>
      activeProfile
        ? createNativeTherapyContextDataSource({
            glucoseDataSource: trendsDataSource,
            ...(activeJournalWorkspace === undefined
              ? {}
              : {journal: activeJournalWorkspace}),
            thresholds: {
              targetMinMgDl: glucoseSettings.hypo,
              targetMaxMgDl: glucoseSettings.hyper,
            },
          })
        : undefined,
    [
      activeProfile,
      activeJournalWorkspace,
      glucoseSettings.hyper,
      glucoseSettings.hypo,
      trendsDataSource,
    ],
  );
  const trendsRuntime = useMemo(
    () => ({
      dataSource: trendsDataSource,
      thresholds: {
        veryLowMaxMgDl: glucoseSettings.severeHypo,
        targetMinMgDl: glucoseSettings.hypo,
        targetMaxMgDl: glucoseSettings.hyper,
        highMaxMgDl: glucoseSettings.severeHyper,
      },
      ...(therapyContextDataSource === undefined
        ? {}
        : {
            therapyContext: {
              dataSource: therapyContextDataSource,
            },
          }),
    }),
    [glucoseSettings, therapyContextDataSource, trendsDataSource],
  );
  const opaqueNightscoutSourceId =
    activeJournalWorkspace?.scope.nightscoutSourceId ??
    (activeSourceRevision === undefined
      ? 'nightscout-active'
      : `nightscout_${activeSourceRevision.slice(0, 40)}`);
  const dayGraphTimelineLoader = useMemo(
    () =>
      createNativeDayGraphTimelineLoader({
        locale: language,
        nightscoutSourceId: opaqueNightscoutSourceId,
        ...(activeJournalWorkspace === undefined
          ? {}
          : {journal: activeJournalWorkspace}),
      }),
    [activeJournalWorkspace, language, opaqueNightscoutSourceId],
  );
  const dayGraphDataSource = useMemo(
    () =>
      createNativeDayGraphDataSource({
        locale: language,
        nightscoutSourceId: opaqueNightscoutSourceId,
        ...(activeJournalWorkspace === undefined
          ? {}
          : {journal: activeJournalWorkspace}),
      }),
    [activeJournalWorkspace, language, opaqueNightscoutSourceId],
  );
  const preMealIntentStore = useMemo(
    () =>
      createNativePreMealIntentStore({
        scopeId:
          activeJournalWorkspace?.scope.workspaceId ?? opaqueNightscoutSourceId,
      }),
    [activeJournalWorkspace?.scope.workspaceId, opaqueNightscoutSourceId],
  );
  const preMealNotificationScopeId =
    activeJournalWorkspace?.scope.workspaceId ?? opaqueNightscoutSourceId;
  useEffect(() => {
    let active = true;
    setPreMealIntent(undefined);
    preMealIntentStore.load().then(
      intent => {
        if (active) {
          setPreMealIntent(intent);
        }
      },
      () => {
        if (active) {
          setPreMealIntent(undefined);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [preMealIntentStore]);
  const startPreMealIntent = useCallback(async () => {
    const intent = await preMealIntentStore.start();
    setPreMealIntent(intent);
  }, [preMealIntentStore]);
  const clearPreMealIntent = useCallback(async () => {
    await preMealIntentStore.clear();
    setPreMealIntent(undefined);
  }, [preMealIntentStore]);
  usePreMealNotifications({
    scopeId: preMealNotificationScopeId,
    locale: language,
    enabled:
      proactiveCareSettings.enabled &&
      proactiveCareSettings.preMealAssistance.enabled &&
      proactiveCareSettings.preMealAssistance.notificationsEnabled,
    ...(preMealIntent === undefined ? {} : {intent: preMealIntent}),
  });
  const preMealAssistanceDataSource = useMemo(
    () =>
      createNativePreMealAssistanceDataSource({
        ...(preMealIntent === undefined ? {} : {intent: preMealIntent}),
        latestSnapshotState: latestNightscoutSnapshotState,
      }),
    [latestNightscoutSnapshotState, preMealIntent],
  );
  const dayGraphRuntime = useMemo(
    () => ({
      dataSource: dayGraphDataSource,
      preMealAssistance: {
        settings: proactiveCareSettings.preMealAssistance,
        dataSource: preMealAssistanceDataSource,
        intentActive:
          preMealIntent !== undefined &&
          preMealIntent.expiresAtMs > currentTime,
        onStartIntent: startPreMealIntent,
        onClearIntent: clearPreMealIntent,
      },
    }),
    [
      clearPreMealIntent,
      currentTime,
      dayGraphDataSource,
      preMealAssistanceDataSource,
      preMealIntent,
      proactiveCareSettings.preMealAssistance,
      startPreMealIntent,
    ],
  );
  const previousDaySummaryDataSource = useMemo(
    () =>
      createNativePreviousDaySummaryDataSource({
        glucoseDataSource: trendsDataSource,
        loadInsulinSummary: insulinSummaryLoader,
        loadTimelineItems: dayGraphTimelineLoader,
      }),
    [dayGraphTimelineLoader, insulinSummaryLoader, trendsDataSource],
  );
  const previousDaySummaryRuntime = useMemo(
    () => ({
      dataSource: previousDaySummaryDataSource,
      thresholds: {
        veryLowMaxMgDl: glucoseSettings.severeHypo,
        targetMinMgDl: glucoseSettings.hypo,
        targetMaxMgDl: glucoseSettings.hyper,
        highMaxMgDl: glucoseSettings.severeHyper,
      },
    }),
    [glucoseSettings, previousDaySummaryDataSource],
  );
  const similarEventsRuntime = useMemo(
    () => ({
      dataSource: {
        loadGlucoseSamples: async (
          period: Parameters<typeof trendsDataSource.loadGlucoseSamples>[0],
          signal: AbortSignal,
        ) => {
          if (signal.aborted) {
            throw new Error('Similar-events request was canceled.');
          }
          const samples = await trendsDataSource.loadGlucoseSamples(period);
          if (signal.aborted) {
            throw new Error('Similar-events request was canceled.');
          }
          return samples;
        },
      },
      thresholds: {
        lowBelowMgDl: glucoseSettings.hypo,
        highAboveMgDl: glucoseSettings.hyper,
      },
    }),
    [glucoseSettings.hyper, glucoseSettings.hypo, trendsDataSource],
  );
  const loopChangesDataSource = useMemo(
    () =>
      createNativeLoopChangesDataSource({
        glucoseDataSource: trendsDataSource,
        ...(activeSourceRevision === undefined
          ? {}
          : {sourceRevision: activeSourceRevision}),
      }),
    [activeSourceRevision, trendsDataSource],
  );
  const loopChangesRuntime = useMemo(
    () => ({
      dataSource: loopChangesDataSource,
      thresholds: {
        veryLowMaxMgDl: glucoseSettings.severeHypo,
        targetMinMgDl: glucoseSettings.hypo,
        targetMaxMgDl: glucoseSettings.hyper,
        highMaxMgDl: glucoseSettings.severeHyper,
      },
    }),
    [glucoseSettings, loopChangesDataSource],
  );
  const alertWorkspaceId = activeJournalWorkspace?.scope.workspaceId;
  const updateCenterRepository = useMemo(
    () =>
      alertWorkspaceId === undefined
        ? undefined
        : createNativeUpdateCenterRepository({scopeId: alertWorkspaceId}),
    [alertWorkspaceId],
  );
  const alertRulesRepository = useMemo(
    () =>
      alertWorkspaceId === undefined
        ? undefined
        : createNativeAlertRulesRepository({scopeId: alertWorkspaceId}),
    [alertWorkspaceId],
  );
  useEffect(
    () =>
      activateNativeAlertSynchronization({
        rules: alertRulesRepository,
        updates: updateCenterRepository,
      }),
    [alertRulesRepository, updateCenterRepository],
  );
  useGlucoseRuleNotifications(
    latestNightscoutSnapshotState.snapshot,
    alertWorkspaceId,
    updateCenterRepository,
    language,
  );
  useProactiveCareUpdateCenter({
    scopeId: alertWorkspaceId,
    locale: language,
    repository: updateCenterRepository,
    preMealNotificationsEnabled:
      proactiveCareSettings.enabled &&
      proactiveCareSettings.preMealAssistance.enabled &&
      proactiveCareSettings.preMealAssistance.notificationsEnabled,
    ...(preMealIntent === undefined ? {} : {preMealIntent}),
  });
  const alertsRuntime = useMemo(
    () =>
      alertWorkspaceId === undefined ||
      updateCenterRepository === undefined ||
      alertRulesRepository === undefined
        ? undefined
        : {
            updateCenter: {
              repository: updateCenterRepository,
            },
            alertRules: {
              repository: alertRulesRepository,
            },
          },
    [alertRulesRepository, alertWorkspaceId, updateCenterRepository],
  );
  const currentSnapshotTarget = useMemo(
    () => selectCurrentSnapshotTarget(coreDestinationRegistry, {runtime}),
    [runtime],
  );
  const currentSnapshot = createCurrentSnapshotViewModel({
    locale: language,
    nowMs: currentTime,
    state: latestNightscoutSnapshotState,
    target: currentSnapshotTarget,
  });
  const layout = getPersonalizationLayout(runtime.platform, width, height);
  const personalization = useNativeProductPersonalization({
    ...(firebaseUserId === undefined ? {} : {firebaseUserId}),
    ...(activeProfile?.baseUrl === undefined
      ? {}
      : {nightscoutBaseUrl: activeProfile.baseUrl}),
    layout,
  });

  const journalError =
    journal.status === 'error'
      ? journal.message
      : journal.status === 'unavailable'
      ? language === 'he'
        ? 'יש להתחבר ולבחור מקור Nightscout כדי לפתוח את היומן.'
        : 'Sign in and select a Nightscout source to open the Journal.'
      : undefined;

  const savePersonalization = useCallback(
    async (change: ProductPersonalizationChange) => {
      if (personalization.status !== 'ready') {
        throw new Error('Product preferences are unavailable.');
      }
      const saved = await personalization.save(change);
      if (!saved) {
        throw new Error('Product preferences could not be saved.');
      }
    },
    [personalization],
  );

  const outbox = useSyncExternalStore(
    activeJournalWorkspace?.outbox.subscribe ?? subscribeToNothing,
    activeJournalWorkspace?.outbox.getSnapshot ?? getEmptyOutbox,
    activeJournalWorkspace?.outbox.getSnapshot ?? getEmptyOutbox,
  );
  const openSettingsSection = useCallback(
    (
      section:
        | 'account'
        | 'nightscout'
        | 'ai-credentials'
        | 'alerts'
        | 'diagnostics',
    ) => {
      if (section === 'alerts') {
        return;
      }
      if (section === 'nightscout') {
        navigation.navigate(
          NIGHTSCOUT_SETUP_SCREEN,
          activeProfile ? {profileId: activeProfile.id} : undefined,
        );
        return;
      }
      setSettingsDetail(section);
    },
    [activeProfile, navigation],
  );
  const aiRuntime = useLegacyAiAnalystModuleRuntime(language, {
    onOpenSettings: () => openSettingsSection('ai-credentials'),
  });
  const settingsRuntime = useMemo(() => {
    if (personalization.status !== 'ready') {
      return undefined;
    }
    return {
      dataSource: createNativeSettingsDataSource({
        language,
        layout,
        personalization: personalization.preferences,
        savePersonalization,
        setLanguage,
        ai: {
          enabled: aiSettings.enabled,
          credentialConfigured: aiSettings.apiKey.trim().length > 0,
          setEnabled: enabled => setAiSetting('enabled', enabled),
        },
        preMealAssistance: {
          ...proactiveCareSettings.preMealAssistance,
          setSettings: settings =>
            setProactiveCareSetting('preMealAssistance', settings),
        },
        account: {
          status: firebaseUser ? 'signed-in' : 'signed-out',
          ...(accountDisplayLabel ? {displayLabel: accountDisplayLabel} : {}),
        },
        nightscout: {
          status: activeProfile ? 'connected' : 'not-connected',
          ...(activeProfile?.label ? {displayLabel: activeProfile.label} : {}),
          credentialConfigured:
            (activeProfile?.apiSecretSha1.trim().length ?? 0) > 0,
        },
        offline: {
          status:
            journal.status === 'ready'
              ? outbox.length > 0
                ? 'syncing'
                : 'ready'
              : 'unavailable',
          pendingWrites: outbox.length,
        },
      }),
      onOpenSection: openSettingsSection,
    } as const;
  }, [
    activeProfile,
    accountDisplayLabel,
    aiSettings.apiKey,
    aiSettings.enabled,
    firebaseUser,
    journal.status,
    language,
    layout,
    openSettingsSection,
    outbox.length,
    personalization,
    proactiveCareSettings.preMealAssistance,
    savePersonalization,
    setAiSetting,
    setProactiveCareSetting,
    setLanguage,
  ]);

  const signOut = useCallback(async () => {
    try {
      await unregisterDeviceToken();
    } catch {
      // Session revocation must still continue if token cleanup is offline.
    }
    try {
      await GoogleIdentity.signOut();
    } catch {
      // Firebase remains the authoritative app session. A missing Google
      // provider session must not prevent the Product User from signing out.
    }
    await firebaseSignOut(getAuth(getApp()));
    setSettingsDetail(undefined);
  }, []);

  const diagnostics = useMemo(
    () => [
      {
        label: language === 'he' ? 'פלטפורמה' : 'Platform',
        value:
          Platform.OS === 'ios'
            ? 'iOS'
            : Platform.OS === 'android'
            ? 'Android'
            : 'Web',
      },
      {
        label: language === 'he' ? 'שפה' : 'Language',
        value: language === 'he' ? 'עברית' : 'English',
      },
      {
        label: language === 'he' ? 'חשבון' : 'Account',
        value:
          accountDisplayLabel ??
          (language === 'he' ? 'לא מחובר' : 'Not signed in'),
      },
      {
        label: language === 'he' ? 'סביבת עבודה' : 'Workspace',
        value:
          activeProfile?.label ??
          (language === 'he' ? 'לא נבחרה' : 'Not selected'),
      },
      {
        label: language === 'he' ? 'יומן מקומי' : 'Local Journal',
        value:
          journal.status === 'ready'
            ? language === 'he'
              ? 'מוכן'
              : 'Ready'
            : language === 'he'
            ? 'לא זמין'
            : 'Unavailable',
      },
      {
        label: language === 'he' ? 'ממתינים לסנכרון' : 'Pending sync',
        value: String(outbox.length),
      },
    ],
    [
      accountDisplayLabel,
      activeProfile?.label,
      journal.status,
      language,
      outbox.length,
    ],
  );

  if (personalization.status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#1769AA" />
        <Text style={styles.loadingText}>
          {language === 'he' ? 'טוען את הסידור שלך…' : 'Loading your layout…'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ProductExperience
        currentSnapshot={currentSnapshot}
        aiRuntime={aiRuntime}
        {...(alertsRuntime === undefined ? {} : {alertsRuntime})}
        dailyOverviewRuntime={dailyOverviewRuntime}
        dayGraphRuntime={dayGraphRuntime}
        previousDaySummaryRuntime={previousDaySummaryRuntime}
        similarEventsRuntime={similarEventsRuntime}
        {...(settingsRuntime === undefined
          ? {}
          : {settingsRuntime: {...settingsRuntime, nightscoutConnection}})}
        locale={language}
        loopChangesRuntime={loopChangesRuntime}
        {...(navigationIntent === undefined ? {} : {navigationIntent})}
        onNavigationIntentConsumed={() =>
          navigation.setParams({productIntent: undefined})
        }
        personalizationLayout={layout}
        runtime={runtime}
        trendsRuntime={trendsRuntime}
        {...(journal.status === 'ready'
          ? {journalWorkspace: journal.workspace}
          : {})}
        mealImagesRuntime={nativeMealImagesRuntime}
        {...(journalError === undefined ? {} : {journalError})}
        {...(personalization.status === 'ready'
          ? {
              personalization: personalization.preferences,
              onPersonalizationChange: savePersonalization,
            }
          : {})}
      />
      <Modal
        animationType="slide"
        onRequestClose={() => setSettingsDetail(undefined)}
        visible={settingsDetail !== undefined}>
        {settingsDetail ? (
          <SettingsDetailView
            {...(accountDisplayLabel === undefined
              ? {}
              : {accountLabel: accountDisplayLabel})}
            diagnostics={diagnostics}
            locale={language}
            onClearAiCredential={async () => setAiSetting('apiKey', '')}
            onClose={() => setSettingsDetail(undefined)}
            onSaveAiCredential={async credential =>
              setAiSetting('apiKey', credential)
            }
            onSignOut={signOut}
            section={settingsDetail}
            status={{
              credentialConfigured: aiSettings.apiKey.trim().length > 0,
            }}
          />
        ) : null}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FA',
    padding: 24,
  },
  loadingText: {color: '#5C6875', fontSize: 15, marginTop: 12},
});

export default ProductExperienceScreen;
