import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {useWindowDimensions} from 'react-native';
import type {JournalWorkspace} from '../src/modules/journal';
import type {MealImagesRuntime} from '../src/modules/mealMedia';
import {
  coreDestinationRegistry,
  type DestinationLocale,
} from '../src/product/destinations';
import {selectCurrentSnapshotTarget} from '../src/product/hub';
import {getPersonalizationLayout} from '../src/product/personalization';
import type {
  PersonalizationLayout,
  ProductPersonalizationChange,
  StoredProductPersonalization,
} from '../src/product/personalization';
import {createNativeSettingsDataSource} from '../src/platform/native/settings/nativeSettingsDataSource';
import type {AlertsModuleRuntime} from '../src/product/alerts';
import {
  AuthenticatedWebApiClient,
  activateBrowserNightscoutStatusMonitor,
  BrowserAiService,
  BrowserFirebaseAuth,
  BrowserNightscoutClient,
  createAuthenticatedBrowserWorkspaceScope,
  createBrowserAiEvidenceProvider,
  createBrowserAlertRulesRepository,
  createBrowserFirebaseAlertsRemoteAdapter,
  createBrowserFirebaseJournalRemoteAdapter,
  createBrowserJournalEngine,
  createBrowserJournalRetryTrigger,
  createBrowserKeyValueStore,
  createBrowserMealImagesRuntime,
  createBrowserNightscoutDataSources,
  createBrowserPreMealAssistanceController,
  createBrowserProductPersonalizationRepository,
  createBrowserUpdateCenterRepository,
  createFirestoreRestGateway,
  createOpaqueBrowserId,
  createWebDestinationRuntime,
  getOrCreateBrowserWorkspaceScope,
  tryParseWebRuntimeConfig,
  useBrowserAiAnalystRuntime,
  useBrowserCurrentSnapshot,
} from '../src/platform/web';
import type {
  BrowserPreMealAssistanceController,
  BrowserFirebaseAuthSnapshot,
  BrowserNightscoutStatus,
  IndexedDbKeyValueStore,
  WebRuntimeConfig,
} from '../src/platform/web';
import {ConnectionPanel} from './ConnectionPanel';
import {
  emptyMarker,
  markerKey,
  resolveConnections,
  type ConnectionMarker,
} from './connectionStatus';
import {
  disableGoogleAutoSelect,
  GoogleSignInButton,
} from './GoogleSignInButton';

const ProductExperience = React.lazy(() =>
  import('../src/product/app/ProductExperience').then(module => ({
    default: module.ProductExperience,
  })),
);

const LANGUAGE_STORAGE_KEY = 'shani.web.language.v1';

const DEFAULT_THRESHOLDS = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

type RuntimeGlobal = typeof globalThis & {
  __SHANI_WEB_CONFIG__?: {
    readonly firebaseApiKey?: string;
    readonly firebaseProjectId?: string;
    readonly firebaseStorageBucket?: string;
    readonly googleClientId?: string;
    readonly apiBaseUrl?: string;
  };
};

const globalConfig = (globalThis as RuntimeGlobal).__SHANI_WEB_CONFIG__;
const environmentProjectId =
  globalConfig?.firebaseProjectId ?? import.meta.env.VITE_FIREBASE_PROJECT_ID;
const CONFIG_RESULT = tryParseWebRuntimeConfig({
  firebaseApiKey:
    globalConfig?.firebaseApiKey ?? import.meta.env.VITE_FIREBASE_API_KEY,
  firebaseProjectId: environmentProjectId,
  firebaseStorageBucket:
    globalConfig?.firebaseStorageBucket ??
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  googleClientId:
    globalConfig?.googleClientId ?? import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID,
  apiBaseUrl:
    globalConfig?.apiBaseUrl ??
    import.meta.env.VITE_SHANI_API_BASE_URL ??
    (typeof environmentProjectId === 'string'
      ? `https://us-central1-${environmentProjectId}.cloudfunctions.net/shaniApi`
      : undefined),
});

const COPY = {
  en: {
    appName: 'Shani Diabetes',
    local: 'Offline-first',
    connected: 'Cloud sync active',
    offline: 'Working offline',
    localOnly: 'Local workspace',
    loading: 'Opening your workspace…',
    failed: 'The browser workspace could not be opened.',
    retry: 'Try again',
    english: 'English',
    hebrew: 'עברית',
    connections: 'Connections',
    signOut: 'Sign out',
    signedInAs: 'Signed in as',
    cloudMissing:
      'Cloud configuration is not present in this build. Local meals, activity, personalization, and navigation remain available.',
  },
  he: {
    appName: 'Shani Diabetes',
    local: 'עובד קודם מקומית',
    connected: 'סנכרון ענן פעיל',
    offline: 'עובד ללא חיבור',
    localOnly: 'סביבת עבודה מקומית',
    loading: 'פותח את סביבת העבודה…',
    failed: 'לא הצלחנו לפתוח את סביבת העבודה בדפדפן.',
    retry: 'ניסיון נוסף',
    english: 'English',
    hebrew: 'עברית',
    connections: 'חיבורים',
    signOut: 'התנתקות',
    signedInAs: 'מחובר בתור',
    cloudMissing:
      'הגדרת הענן אינה קיימת בבילד הזה. ארוחות, פעילות, התאמה אישית וניווט עדיין זמינים מקומית.',
  },
} as const;

interface BrowserResources {
  readonly keyValueStore: IndexedDbKeyValueStore;
  readonly personalizationRepository: ReturnType<
    typeof createBrowserProductPersonalizationRepository
  >;
  readonly personalizationScope: Parameters<
    ReturnType<typeof createBrowserProductPersonalizationRepository>['open']
  >[0];
  readonly scope: JournalWorkspace['scope'];
  readonly api?: AuthenticatedWebApiClient;
  readonly aiService: BrowserAiService;
  readonly nightscout: BrowserNightscoutStatus;
  readonly aiConfigured: boolean;
  readonly aiEnabled: boolean;
  readonly nightscoutClient?: BrowserNightscoutClient;
  readonly journalRemote: boolean;
  readonly alertsRuntime: AlertsModuleRuntime;
  readonly preMealAssistance: BrowserPreMealAssistanceController;
  readonly mealImagesRuntime: MealImagesRuntime;
  readonly accountLabel?: string;
}

type BootstrapState =
  | {readonly status: 'loading'}
  | {readonly status: 'error'; readonly message: string}
  | {
      readonly status: 'ready';
      readonly workspace: JournalWorkspace;
      readonly personalization: StoredProductPersonalization;
      readonly resources: BrowserResources;
    };

type BrowserBootstrapSession =
  | {readonly status: 'loading' | 'signed-out'}
  | {
      readonly status: 'signed-in';
      readonly uid: string;
      readonly email: string;
      readonly displayName?: string;
    };

const readInitialLocale = (): DestinationLocale => {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'he') {
      return stored;
    }
  } catch {
    // The language still works for this session.
  }
  return globalThis.navigator?.language?.toLowerCase().startsWith('he')
    ? 'he'
    : 'en';
};

const writeLocale = (locale: DestinationLocale): void => {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // The language still works for this session.
  }
};

const BrowserProduct = (props: {
  readonly locale: DestinationLocale;
  readonly layout: PersonalizationLayout;
  readonly state: Extract<BootstrapState, {status: 'ready'}>;
  readonly savePersonalization: (
    change: ProductPersonalizationChange,
  ) => Promise<void>;
  readonly setLocale: (locale: DestinationLocale) => void;
  readonly setAiEnabled: (enabled: boolean) => Promise<void>;
  readonly openConnections: () => void;
  readonly authConnection?: 'online' | 'offline';
}) => {
  const {
    locale,
    layout,
    state,
    savePersonalization,
    setLocale: applyLocale,
    setAiEnabled,
    openConnections,
    authConnection,
  } = props;
  const {resources} = state;
  const preMealAssistance = useSyncExternalStore(
    resources.preMealAssistance.subscribe,
    resources.preMealAssistance.getSnapshot,
    resources.preMealAssistance.getSnapshot,
  );
  const dataSources = useMemo(
    () =>
      resources.nightscoutClient === undefined
        ? undefined
        : createBrowserNightscoutDataSources({
            client: resources.nightscoutClient,
            sourceId:
              resources.nightscout.sourceId ??
              resources.scope.nightscoutSourceId,
            locale,
            journal: state.workspace,
          }),
    [
      locale,
      resources.nightscout.sourceId,
      resources.nightscoutClient,
      resources.scope.nightscoutSourceId,
      state.workspace,
    ],
  );
  const runtime = useMemo(
    () =>
      createWebDestinationRuntime({
        authenticated: resources.api !== undefined,
        journalRemote: resources.journalRemote,
        nightscout: dataSources !== undefined,
        ai: resources.api !== undefined,
        alerts: true,
        locale,
      }),
    [dataSources, locale, resources.api, resources.journalRemote],
  );
  const currentSnapshotTarget = useMemo(
    () => selectCurrentSnapshotTarget(coreDestinationRegistry, {runtime}),
    [runtime],
  );
  const currentSnapshot = useBrowserCurrentSnapshot({
    ...(resources.nightscoutClient === undefined
      ? {}
      : {client: resources.nightscoutClient}),
    locale,
    target: currentSnapshotTarget,
  });
  const aiEvidenceProvider = useMemo(
    () =>
      resources.nightscoutClient === undefined ||
      resources.nightscout.sourceId === undefined
        ? undefined
        : createBrowserAiEvidenceProvider({
            client: resources.nightscoutClient,
            sourceId: resources.nightscout.sourceId,
          }),
    [resources.nightscout.sourceId, resources.nightscoutClient],
  );
  const aiRuntime = useBrowserAiAnalystRuntime({
    service: resources.aiService,
    storage: resources.keyValueStore,
    scopeId: `${resources.scope.productUserId}-${resources.scope.workspaceId}`,
    locale,
    enabled: resources.aiEnabled,
    credentialConfigured: resources.aiConfigured,
    ...(aiEvidenceProvider === undefined
      ? {}
      : {evidenceProvider: aiEvidenceProvider}),
    onOpenSettings: openConnections,
  });
  const settingsDataSource = useMemo(
    () =>
      createNativeSettingsDataSource({
        language: locale,
        layout,
        personalization: state.personalization,
        savePersonalization,
        setLanguage: async language => applyLocale(language),
        ai: {
          enabled: resources.aiEnabled,
          credentialConfigured: resources.aiConfigured,
          setEnabled: setAiEnabled,
        },
        preMealAssistance: {
          ...preMealAssistance.settings,
          setSettings: settings =>
            resources.preMealAssistance.setSettings(settings),
        },
        account: {
          status: resources.api ? 'signed-in' : 'signed-out',
          ...(resources.accountLabel === undefined
            ? {}
            : {displayLabel: resources.accountLabel}),
        },
        nightscout: {
          status: resources.nightscout.configured
            ? 'connected'
            : 'not-connected',
          ...(resources.nightscout.displayLabel === undefined
            ? {}
            : {displayLabel: resources.nightscout.displayLabel}),
          credentialConfigured: resources.nightscout.configured,
        },
        offline: {
          status:
            authConnection === 'offline'
              ? 'offline'
              : state.workspace.outbox.getSnapshot().length > 0
              ? 'syncing'
              : 'ready',
          pendingWrites: state.workspace.outbox.getSnapshot().length,
        },
      }),
    [
      applyLocale,
      layout,
      locale,
      savePersonalization,
      setAiEnabled,
      state.personalization,
      state.workspace.outbox,
      resources.accountLabel,
      resources.aiConfigured,
      resources.aiEnabled,
      resources.api,
      resources.nightscout,
      resources.preMealAssistance,
      preMealAssistance.settings,
      authConnection,
    ],
  );
  return (
    <ProductExperience
      aiRuntime={aiRuntime}
      alertsRuntime={resources.alertsRuntime}
      {...(currentSnapshot === undefined ? {} : {currentSnapshot})}
      {...(dataSources === undefined
        ? {}
        : {
            trendsRuntime: {
              dataSource: dataSources.trends,
              thresholds: DEFAULT_THRESHOLDS,
              therapyContext: {
                dataSource: dataSources.therapyContext,
              },
            },
            dayGraphRuntime: {
              dataSource: dataSources.dayGraph,
              preMealAssistance: {
                settings: preMealAssistance.settings,
                dataSource: resources.preMealAssistance.dataSource,
                intentActive:
                  preMealAssistance.intent !== undefined &&
                  preMealAssistance.intent.expiresAtMs > Date.now(),
                onStartIntent: () => resources.preMealAssistance.startIntent(),
                onClearIntent: () => resources.preMealAssistance.clearIntent(),
              },
            },
            dailyOverviewRuntime: {
              dataSource: dataSources.dailyOverview,
              thresholds: DEFAULT_THRESHOLDS,
            },
            previousDaySummaryRuntime: {
              dataSource: dataSources.previousDaySummary,
              thresholds: DEFAULT_THRESHOLDS,
            },
            similarEventsRuntime: {
              dataSource: dataSources.similarEvents,
              thresholds: {
                lowBelowMgDl: DEFAULT_THRESHOLDS.targetMinMgDl,
                highAboveMgDl: DEFAULT_THRESHOLDS.targetMaxMgDl,
              },
              timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
            },
            loopChangesRuntime: {
              dataSource: dataSources.loopChanges,
              thresholds: DEFAULT_THRESHOLDS,
            },
          })}
      journalWorkspace={state.workspace}
      mealImagesRuntime={resources.mealImagesRuntime}
      locale={locale}
      onPersonalizationChange={savePersonalization}
      personalization={state.personalization}
      personalizationLayout={layout}
      runtime={runtime}
      settingsRuntime={{
        dataSource: settingsDataSource,
        onOpenSection: section => {
          if (
            section === 'account' ||
            section === 'nightscout' ||
            section === 'ai-credentials' ||
            section === 'diagnostics'
          ) {
            openConnections();
          }
        },
      }}
    />
  );
};

export const BrowserApp = () => {
  const {width} = useWindowDimensions();
  const layout = useMemo(() => getPersonalizationLayout('web', width), [width]);
  const [locale, setLocale] = useState<DestinationLocale>(readInitialLocale);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const connectionsChanged = useRef(false);
  const [authError, setAuthError] = useState<string | undefined>(undefined);
  const [state, setState] = useState<BootstrapState>({status: 'loading'});
  const [storage] = useState(() => {
    try {
      return {ok: true as const, value: createBrowserKeyValueStore()};
    } catch (error) {
      return {
        ok: false as const,
        message:
          error instanceof Error ? error.message : 'IndexedDB is unavailable.',
      };
    }
  });
  const [auth, setAuth] = useState<BrowserFirebaseAuth | undefined>();
  const [authSnapshot, setAuthSnapshot] = useState<BrowserFirebaseAuthSnapshot>(
    CONFIG_RESULT.ok ? {status: 'loading'} : {status: 'signed-out'},
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const appliedPersonalizationLayoutRef = useRef<
    PersonalizationLayout | undefined
  >(undefined);
  const bootstrapIdentity =
    authSnapshot.status === 'signed-in' ? authSnapshot.identity : undefined;
  const bootstrapSession = useMemo<BrowserBootstrapSession>(() => {
    if (authSnapshot.status === 'loading') {
      return {status: 'loading'};
    }
    if (
      authSnapshot.status === 'signed-out' ||
      bootstrapIdentity === undefined
    ) {
      return {status: 'signed-out'};
    }
    return {
      status: 'signed-in',
      uid: bootstrapIdentity.uid,
      email: bootstrapIdentity.email,
      ...(bootstrapIdentity.displayName === undefined
        ? {}
        : {displayName: bootstrapIdentity.displayName}),
    };
  }, [authSnapshot.status, bootstrapIdentity]);
  const personalizationRef = useRef<StoredProductPersonalization | undefined>(
    undefined,
  );
  const bootstrapScopeTokenRef = useRef(0);
  const writeTail = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    writeLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (!CONFIG_RESULT.ok || !storage.ok) {
      return;
    }
    const client = new BrowserFirebaseAuth({
      apiKey: CONFIG_RESULT.value.firebaseApiKey,
      storage: storage.value,
    });
    setAuth(client);
    const unsubscribe = client.subscribe(() =>
      setAuthSnapshot(client.getSnapshot()),
    );
    client.initialize().catch(error => {
      setAuthError(
        error instanceof Error ? error.message : 'Authentication failed.',
      );
      setAuthSnapshot({status: 'signed-out'});
    });
    return unsubscribe;
  }, [storage]);

  useEffect(() => {
    const scopeToken = bootstrapScopeTokenRef.current + 1;
    bootstrapScopeTokenRef.current = scopeToken;
    let active = true;
    const isCurrentScope = (): boolean =>
      active && bootstrapScopeTokenRef.current === scopeToken;
    let deactivateSync: (() => void) | undefined;
    let deactivateAlertsSync: (() => void) | undefined;
    let mealImagesHandle:
      | ReturnType<typeof createBrowserMealImagesRuntime>
      | undefined;
    setState({status: 'loading'});
    const open = async () => {
      if (!storage.ok) {
        throw new Error(storage.message);
      }
      const keyValueStore = storage.value;
      const signedIn =
        CONFIG_RESULT.ok &&
        auth !== undefined &&
        bootstrapSession.status === 'signed-in';
      let config: WebRuntimeConfig | undefined;
      let api: AuthenticatedWebApiClient | undefined;
      let marker = emptyMarker();
      let scope: JournalWorkspace['scope'];
      let gateway: ReturnType<typeof createFirestoreRestGateway> | undefined;
      if (signedIn) {
        config = CONFIG_RESULT.value;
        api = new AuthenticatedWebApiClient({
          baseUrl: config.apiBaseUrl,
          auth,
        });
        marker = await resolveConnections({
          uid: bootstrapSession.uid,
          api,
          storage: keyValueStore,
        });
        const sourceId =
          marker.nightscout.sourceId ?? 'nightscout-unconfigured';
        scope = createAuthenticatedBrowserWorkspaceScope({
          uid: bootstrapSession.uid,
          workspaceId:
            marker.nightscout.workspaceId ?? 'workspace_unconfigured',
          nightscoutSourceId: sourceId,
        });
        gateway = createFirestoreRestGateway({
          projectId: config.firebaseProjectId,
          auth,
        });
        if (!isCurrentScope()) {
          return;
        }
      } else {
        scope = getOrCreateBrowserWorkspaceScope(
          globalThis.localStorage,
          createOpaqueBrowserId,
        );
      }
      const remoteAdapter =
        signedIn && gateway
          ? createBrowserFirebaseJournalRemoteAdapter({gateway, auth})
          : undefined;
      mealImagesHandle = createBrowserMealImagesRuntime({
        scope,
        strings: keyValueStore,
        ...(signedIn && config !== undefined
          ? {
              auth,
              storageBucket: config.firebaseStorageBucket,
            }
          : {}),
      });
      if (!isCurrentScope()) {
        mealImagesHandle.dispose();
        return;
      }
      const journalResult = await createBrowserJournalEngine(
        keyValueStore,
        remoteAdapter,
        mealImagesHandle.store,
      ).open(scope);
      if (!journalResult.ok) {
        throw new Error(journalResult.error.message);
      }
      const workspace = journalResult.value;
      if (!isCurrentScope()) {
        return;
      }
      if (remoteAdapter) {
        deactivateSync = workspace.sync.activate({
          retryTrigger: createBrowserJournalRetryTrigger(),
        });
      }
      const personalizationRepository =
        createBrowserProductPersonalizationRepository({
          storage: keyValueStore,
          ...(gateway === undefined || auth === undefined
            ? {}
            : {gateway, auth}),
        });
      const personalizationScope = {...scope, layout: layoutRef.current};
      let personalization = await personalizationRepository.open(
        personalizationScope,
      );
      if (!isCurrentScope()) {
        return;
      }
      if (gateway) {
        const synchronized = await personalizationRepository.synchronize(
          personalizationScope,
        );
        personalization = synchronized.preferences;
      }
      if (!isCurrentScope()) {
        return;
      }
      appliedPersonalizationLayoutRef.current = personalizationScope.layout;
      const alertsRemote =
        signedIn && gateway && config !== undefined && auth !== undefined
          ? createBrowserFirebaseAlertsRemoteAdapter({
              projectId: config.firebaseProjectId,
              auth,
              gateway,
            })
          : undefined;
      const alertsSync =
        alertsRemote === undefined
          ? undefined
          : {
              scope: {
                ownerProductUserId: scope.productUserId,
                workspaceId: scope.workspaceId,
              },
              remote: alertsRemote,
            };
      const alertRules = createBrowserAlertRulesRepository({
        storage: keyValueStore,
        scopeId: `${scope.productUserId}-${scope.workspaceId}`,
        ...(alertsSync === undefined ? {} : {sync: alertsSync}),
      });
      const updateCenter = createBrowserUpdateCenterRepository({
        storage: keyValueStore,
        scopeId: `${scope.productUserId}-${scope.workspaceId}`,
        ...(alertsSync === undefined ? {} : {sync: alertsSync}),
      });
      await Promise.all([alertRules.refresh(), updateCenter.refresh()]);
      if (!isCurrentScope()) {
        return;
      }
      if ('activate' in alertRules && 'activate' in updateCenter) {
        const retryTrigger = createBrowserJournalRetryTrigger();
        const deactivateRules = alertRules.activate(retryTrigger);
        const deactivateUpdates = updateCenter.activate(retryTrigger);
        deactivateAlertsSync = () => {
          deactivateRules();
          deactivateUpdates();
        };
      }
      let nightscoutClient: BrowserNightscoutClient | undefined;
      if (
        api &&
        marker.nightscout.configured &&
        marker.nightscout.sourceId &&
        marker.nightscout.workspaceId
      ) {
        nightscoutClient = new BrowserNightscoutClient({
          api,
          storage: keyValueStore,
          sourceId: marker.nightscout.sourceId,
          workspaceId: marker.nightscout.workspaceId,
          onRebootstrapRequired: () => {
            if (isCurrentScope()) {
              setConnectionRevision(revision => revision + 1);
            }
          },
        });
      }
      const preMealAssistance = createBrowserPreMealAssistanceController({
        storage: keyValueStore,
        scope,
        ...(nightscoutClient === undefined ? {} : {client: nightscoutClient}),
      });
      await preMealAssistance.initialize();
      if (!isCurrentScope()) {
        return;
      }
      personalizationRef.current = personalization;
      setState({
        status: 'ready',
        workspace,
        personalization,
        resources: {
          keyValueStore,
          personalizationRepository,
          personalizationScope,
          scope,
          ...(api === undefined ? {} : {api}),
          aiService:
            api === undefined
              ? new BrowserAiService({
                  requestJson: async () => {
                    throw new Error('Sign in before using AI.');
                  },
                })
              : new BrowserAiService(api),
          nightscout: marker.nightscout,
          aiConfigured: marker.aiConfigured,
          aiEnabled: marker.aiEnabled,
          ...(nightscoutClient === undefined ? {} : {nightscoutClient}),
          journalRemote: Boolean(remoteAdapter),
          alertsRuntime: {
            alertRules: {repository: alertRules},
            updateCenter: {repository: updateCenter},
          },
          preMealAssistance,
          mealImagesRuntime: mealImagesHandle.runtime,
          ...(signedIn
            ? {
                accountLabel:
                  bootstrapSession.displayName ?? bootstrapSession.email,
              }
            : {}),
        },
      });
    };
    if (CONFIG_RESULT.ok && bootstrapSession.status === 'loading') {
      return;
    }
    open().catch(error => {
      deactivateSync?.();
      deactivateSync = undefined;
      deactivateAlertsSync?.();
      deactivateAlertsSync = undefined;
      mealImagesHandle?.dispose();
      mealImagesHandle = undefined;
      if (isCurrentScope()) {
        setState({
          status: 'error',
          message:
            error instanceof Error ? error.message : 'Unknown browser error',
        });
      }
    });
    return () => {
      active = false;
      deactivateSync?.();
      deactivateAlertsSync?.();
      mealImagesHandle?.dispose();
    };
  }, [auth, bootstrapSession, bootstrapAttempt, connectionRevision, storage]);

  const statusMonitorApi =
    state.status === 'ready' ? state.resources.api : undefined;
  const statusMonitorNightscout =
    state.status === 'ready' ? state.resources.nightscout : undefined;

  useEffect(() => {
    if (
      statusMonitorApi === undefined ||
      statusMonitorNightscout === undefined
    ) {
      return undefined;
    }
    return activateBrowserNightscoutStatusMonitor({
      currentStatus: statusMonitorNightscout,
      readStatus: () => BrowserNightscoutClient.status(statusMonitorApi),
      onIdentityChanged: () => setConnectionRevision(revision => revision + 1),
    });
  }, [statusMonitorApi, statusMonitorNightscout]);

  const activePersonalizationRepository =
    state.status === 'ready'
      ? state.resources.personalizationRepository
      : undefined;
  const activePersonalizationProductUserId =
    state.status === 'ready' ? state.resources.scope.productUserId : undefined;
  const activePersonalizationWorkspaceId =
    state.status === 'ready' ? state.resources.scope.workspaceId : undefined;
  const activePersonalizationNightscoutSourceId =
    state.status === 'ready'
      ? state.resources.scope.nightscoutSourceId
      : undefined;
  const activePersonalizationHasRemote =
    state.status === 'ready' && state.resources.api !== undefined;

  useEffect(() => {
    if (
      activePersonalizationRepository === undefined ||
      activePersonalizationProductUserId === undefined ||
      activePersonalizationWorkspaceId === undefined ||
      activePersonalizationNightscoutSourceId === undefined ||
      appliedPersonalizationLayoutRef.current === layout
    ) {
      return undefined;
    }
    let active = true;
    const scope = {
      productUserId: activePersonalizationProductUserId,
      workspaceId: activePersonalizationWorkspaceId,
      nightscoutSourceId: activePersonalizationNightscoutSourceId,
      layout,
    };
    appliedPersonalizationLayoutRef.current = layout;
    setState(previous =>
      previous.status === 'ready' &&
      previous.resources.personalizationRepository ===
        activePersonalizationRepository
        ? {
            ...previous,
            resources: {
              ...previous.resources,
              personalizationScope: scope,
            },
          }
        : previous,
    );
    const run = writeTail.current.then(async () => {
      let personalization = await activePersonalizationRepository.open(scope);
      if (activePersonalizationHasRemote) {
        const synchronized = await activePersonalizationRepository.synchronize(
          scope,
        );
        personalization = synchronized.preferences;
      }
      if (!active) {
        return;
      }
      personalizationRef.current = personalization;
      setState(previous =>
        previous.status === 'ready' &&
        previous.resources.personalizationRepository ===
          activePersonalizationRepository &&
        previous.resources.personalizationScope.layout === layout
          ? {...previous, personalization}
          : previous,
      );
    });
    writeTail.current = run.catch(() => undefined);
    return () => {
      active = false;
    };
  }, [
    activePersonalizationHasRemote,
    activePersonalizationNightscoutSourceId,
    activePersonalizationProductUserId,
    activePersonalizationRepository,
    activePersonalizationWorkspaceId,
    layout,
  ]);

  const savePersonalization = useCallback(
    (change: ProductPersonalizationChange): Promise<void> => {
      if (state.status !== 'ready') {
        return Promise.reject(new Error('Personalization is not ready.'));
      }
      const currentState = state;
      const run = writeTail.current.then(async () => {
        const current =
          personalizationRef.current ?? currentState.personalization;
        const next = typeof change === 'function' ? change(current) : change;
        const persisted =
          await currentState.resources.personalizationRepository.save(
            currentState.resources.personalizationScope,
            current,
            next,
          );
        personalizationRef.current = persisted;
        setState(previous =>
          previous.status === 'ready'
            ? {...previous, personalization: persisted}
            : previous,
        );
        currentState.resources.personalizationRepository
          .synchronize(currentState.resources.personalizationScope)
          .then(result => {
            personalizationRef.current = result.preferences;
            setState(previous =>
              previous.status === 'ready' &&
              previous.resources.scope.productUserId ===
                currentState.resources.scope.productUserId
                ? {...previous, personalization: result.preferences}
                : previous,
            );
          })
          .catch(() => undefined);
      });
      writeTail.current = run.catch(() => undefined);
      return run;
    },
    [state],
  );

  const setAiEnabled = useCallback(
    async (enabled: boolean) => {
      if (state.status !== 'ready') {
        return;
      }
      const uid = state.resources.scope.productUserId;
      const marker: ConnectionMarker = {
        schemaVersion: 1,
        nightscout: state.resources.nightscout,
        aiConfigured: state.resources.aiConfigured,
        aiEnabled: enabled,
      };
      await state.resources.keyValueStore.setItem(
        markerKey(uid),
        JSON.stringify(marker),
      );
      setState(previous =>
        previous.status === 'ready'
          ? {
              ...previous,
              resources: {...previous.resources, aiEnabled: enabled},
            }
          : previous,
      );
    },
    [state],
  );

  const copy = COPY[locale];
  const signedIn = authSnapshot.status === 'signed-in';
  const sessionMismatch =
    state.status === 'ready' &&
    !(signedIn
      ? state.resources.scope.productUserId === authSnapshot.identity.uid
      : state.resources.api === undefined);
  const sessionReady = state.status === 'ready' && !sessionMismatch;
  const readyResources = sessionReady ? state.resources : undefined;

  return (
    <div className="web-app" dir={locale === 'he' ? 'rtl' : 'ltr'}>
      <header className="web-status-bar">
        <div className="web-brand-block">
          <strong>{copy.appName}</strong>
          <span className="web-local-badge">{copy.local}</span>
          <span
            className={`web-sync-badge ${
              signedIn ? authSnapshot.connection : 'local'
            }`}>
            {signedIn
              ? authSnapshot.connection === 'online'
                ? copy.connected
                : copy.offline
              : copy.localOnly}
          </span>
        </div>
        <div className="web-account">
          {CONFIG_RESULT.ok && auth ? (
            signedIn ? (
              <>
                <span className="web-account-label">
                  {copy.signedInAs}{' '}
                  {authSnapshot.identity.displayName ??
                    authSnapshot.identity.email}
                </span>
                <button onClick={() => setPanelOpen(true)} type="button">
                  {copy.connections}
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    disableGoogleAutoSelect();
                    auth
                      .signOut()
                      .catch(error =>
                        setAuthError(
                          error instanceof Error
                            ? error.message
                            : 'Sign-out failed.',
                        ),
                      );
                  }}
                  type="button">
                  {copy.signOut}
                </button>
              </>
            ) : (
              <GoogleSignInButton
                clientId={CONFIG_RESULT.value.googleClientId}
                locale={locale}
                onCredential={credential =>
                  auth.signInWithGoogleCredential(credential)
                }
                onError={setAuthError}
              />
            )
          ) : null}
        </div>
        <div className="web-language" aria-label="Language">
          <button
            aria-pressed={locale === 'he'}
            className={locale === 'he' ? 'selected' : undefined}
            onClick={() => setLocale('he')}
            type="button">
            {copy.hebrew}
          </button>
          <button
            aria-pressed={locale === 'en'}
            className={locale === 'en' ? 'selected' : undefined}
            onClick={() => setLocale('en')}
            type="button">
            {copy.english}
          </button>
        </div>
        {!CONFIG_RESULT.ok ? (
          <p className="web-limitations">{copy.cloudMissing}</p>
        ) : null}
        {authError ? (
          <p className="web-auth-message" role="alert">
            {authError}
          </p>
        ) : null}
      </header>

      <main className="web-product-root">
        {state.status === 'loading' || sessionMismatch ? (
          <div className="web-state">{copy.loading}</div>
        ) : state.status === 'error' ? (
          <div className="web-state" role="alert">
            <strong>{copy.failed}</strong>
            <span>{state.message}</span>
            <button
              onClick={() => setBootstrapAttempt(attempt => attempt + 1)}
              type="button">
              {copy.retry}
            </button>
          </div>
        ) : (
          <Suspense fallback={<div className="web-state">{copy.loading}</div>}>
            <BrowserProduct
              {...(authSnapshot.status === 'signed-in'
                ? {authConnection: authSnapshot.connection}
                : {})}
              key={`${state.resources.scope.productUserId}:${state.resources.scope.workspaceId}:${state.resources.scope.nightscoutSourceId}`}
              layout={layout as PersonalizationLayout}
              locale={locale}
              openConnections={() => setPanelOpen(true)}
              savePersonalization={savePersonalization}
              setAiEnabled={setAiEnabled}
              setLocale={setLocale}
              state={state}
            />
          </Suspense>
        )}
      </main>
      {panelOpen && readyResources?.api ? (
        <ConnectionPanel
          aiConfigured={readyResources.aiConfigured}
          api={readyResources.api}
          locale={locale}
          nightscout={readyResources.nightscout}
          onChanged={() => {
            connectionsChanged.current = true;
          }}
          onClose={() => {
            setPanelOpen(false);
            if (connectionsChanged.current) {
              connectionsChanged.current = false;
              setConnectionRevision(revision => revision + 1);
            }
          }}
        />
      ) : null}
    </div>
  );
};
