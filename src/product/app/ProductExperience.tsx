import React, {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {JournalWorkspace} from '../../modules/journal';
import type {MealImagesRuntime} from '../../modules/mealMedia';
import type {UpdateCenterSnapshot} from '../../modules/alerts';
import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
} from '../destinations';
import type {
  AvailableDestinationTarget,
  DestinationLocale,
  DestinationRegistry,
  DestinationRuntimeContext,
} from '../destinations';
import {HubView, selectCurrentSnapshotTarget, selectHubViewModel} from '../hub';
import type {CurrentSnapshotViewModel, RecentDestination} from '../hub';
import {
  ProductShellView,
  createDestinationRequest,
  createInitialProductShellState,
  productShellReducer,
  resolveProductShellConfiguration,
} from '../shell';
import type {
  DestinationRequest,
  ProductNavigationIntent,
  ProductShellAction,
  StoredProductShellPreferences,
} from '../shell';
import {
  PersonalizationQuestionnaireView,
  createDefaultProductPersonalization,
  recordRecentModule,
  selectLayoutProfile,
  updateDayGraphPreferences,
  updateDailyOverviewPreferences,
  DEFAULT_DAY_GRAPH_PREFERENCES,
  DEFAULT_DAILY_OVERVIEW_PREFERENCES,
} from '../personalization';
import type {
  PersonalizationLayout,
  PersonalizationQuestionnaireStage,
  ProductPersonalizationChange,
  ProductPersonalizationSaveOptions,
  StoredProductPersonalization,
} from '../personalization';
import type {TrendsModuleRuntime} from '../trends';
import type {DailyOverviewModuleRuntime} from '../dailyOverview';
import type {DayGraphModuleRuntime} from '../dayGraph';
import type {PreviousDaySummaryModuleRuntime} from '../previousDaySummary';
import type {AlertsModuleRuntime} from '../alerts';
import type {SimilarEventsModuleRuntime} from '../similarEvents';
import type {LoopChangesModuleRuntime} from '../loopChanges';
import type {SettingsModuleRuntime} from '../settings';
import type {AiAnalystModuleRuntime} from '../ai';
import {selectJournalOperationalBadges} from './journalBadges';
import {selectAlertOperationalBadges} from './alertBadges';
import {
  coreProductImplementationRegistry,
  type ProductImplementationRegistry,
} from './ProductImplementationRegistry';

const DEFAULT_SHELL_PREFERENCES: StoredProductShellPreferences = {
  schemaVersion: 1,
  shortcuts: [
    createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst),
    createStoredDestinationTarget(CORE_DESTINATION_IDS.updateCenter),
  ],
};

const DEFAULT_FAVORITES = [
  CORE_DESTINATION_IDS.dayGraph,
  CORE_DESTINATION_IDS.dailyOverview,
  CORE_DESTINATION_IDS.trends,
  CORE_DESTINATION_IDS.meals,
  CORE_DESTINATION_IDS.aiAnalyst,
].map(createStoredDestinationTarget);

const DEFAULT_PERSONALIZATION = createDefaultProductPersonalization();
const EMPTY_OUTBOX = [] as const;
const subscribeToNothing = (): (() => void) => () => undefined;
const getEmptyOutbox = () => EMPTY_OUTBOX;
const EMPTY_UPDATE_SNAPSHOT: UpdateCenterSnapshot = {status: 'loading'};
const getEmptyUpdateSnapshot = () => EMPTY_UPDATE_SNAPSHOT;

const BRIDGE_COPY = {
  en: {
    migration: 'This module is preserved while its new view is being rebuilt.',
    open: 'Open current version',
    unavailable: 'The current version is not connected here yet.',
    loading: 'Opening your local Journal…',
  },
  he: {
    migration: 'המודול נשמר בזמן שהתצוגה החדשה שלו נבנית מחדש.',
    open: 'פתיחת הגרסה הנוכחית',
    unavailable: 'הגרסה הנוכחית עדיין לא מחוברת מכאן.',
    loading: 'פותח את היומן המקומי…',
  },
} as const;

export interface ProductExperienceProps {
  readonly locale: DestinationLocale;
  readonly runtime: DestinationRuntimeContext;
  readonly journalWorkspace?: JournalWorkspace;
  readonly mealImagesRuntime?: MealImagesRuntime;
  readonly journalError?: string;
  readonly shellPreferences?: StoredProductShellPreferences;
  readonly personalization?: StoredProductPersonalization;
  readonly personalizationLayout: PersonalizationLayout;
  readonly currentSnapshot?: CurrentSnapshotViewModel;
  /** Core plus verified Runtime Plugin contributions. */
  readonly destinationRegistry?: DestinationRegistry;
  readonly implementationRegistry?: ProductImplementationRegistry;
  readonly trendsRuntime?: TrendsModuleRuntime;
  readonly dailyOverviewRuntime?: DailyOverviewModuleRuntime;
  readonly dayGraphRuntime?: DayGraphModuleRuntime;
  readonly previousDaySummaryRuntime?: PreviousDaySummaryModuleRuntime;
  readonly alertsRuntime?: AlertsModuleRuntime;
  readonly similarEventsRuntime?: Omit<
    SimilarEventsModuleRuntime,
    'onOpenDayGraph' | 'onAskAi'
  >;
  readonly loopChangesRuntime?: Omit<
    LoopChangesModuleRuntime,
    'onOpenDayGraph' | 'onAskAiAdvisor'
  >;
  readonly settingsRuntime?: SettingsModuleRuntime;
  readonly aiRuntime?: AiAnalystModuleRuntime;
  readonly navigationIntent?: ProductNavigationIntent;
  readonly onNavigationIntentConsumed?: (intentId: string) => void;
  readonly onPersonalizationChange?: (
    change: ProductPersonalizationChange,
    options?: ProductPersonalizationSaveOptions,
  ) => Promise<void>;
  readonly onOpenLegacy?: (destination: AvailableDestinationTarget) => void;
}

const ModuleBridge = ({
  destination,
  locale,
  onOpenLegacy,
}: {
  readonly destination: AvailableDestinationTarget;
  readonly locale: DestinationLocale;
  readonly onOpenLegacy?: ProductExperienceProps['onOpenLegacy'];
}) => {
  const copy = BRIDGE_COPY[locale];
  const destinationCopy = destination.destination.copy[locale];
  const rtl = locale === 'he';
  return (
    <View style={styles.bridge} testID="product-module-bridge">
      <Text
        accessibilityRole="header"
        style={[styles.bridgeTitle, rtl && styles.rtlText]}>
        {destinationCopy.title}
      </Text>
      <Text style={[styles.bridgeDescription, rtl && styles.rtlText]}>
        {destinationCopy.description}
      </Text>
      <Text style={[styles.bridgeNote, rtl && styles.rtlText]}>
        {copy.migration}
      </Text>
      {onOpenLegacy ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenLegacy(destination)}
          style={({pressed}) => [
            styles.bridgeButton,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.bridgeButtonLabel}>{copy.open}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.bridgeNote, rtl && styles.rtlText]}>
          {copy.unavailable}
        </Text>
      )}
    </View>
  );
};

export const ProductExperience = ({
  locale,
  runtime,
  journalWorkspace,
  mealImagesRuntime,
  journalError,
  shellPreferences,
  personalization,
  personalizationLayout,
  currentSnapshot,
  destinationRegistry = coreDestinationRegistry,
  implementationRegistry = coreProductImplementationRegistry,
  trendsRuntime,
  dailyOverviewRuntime,
  dayGraphRuntime,
  previousDaySummaryRuntime,
  alertsRuntime,
  similarEventsRuntime,
  loopChangesRuntime,
  settingsRuntime,
  aiRuntime,
  navigationIntent,
  onNavigationIntentConsumed,
  onPersonalizationChange,
  onOpenLegacy,
}: ProductExperienceProps) => {
  const activePersonalization = personalization ?? DEFAULT_PERSONALIZATION;
  const layoutProfile = selectLayoutProfile(
    activePersonalization,
    personalizationLayout,
  );
  const activeTrendsRuntime = trendsRuntime
    ? {...trendsRuntime, showGri: layoutProfile.showGri}
    : undefined;
  const activeDayGraphRuntime: DayGraphModuleRuntime | undefined =
    dayGraphRuntime
      ? {
          ...dayGraphRuntime,
          chartPreferences: {
            scopeKey: JSON.stringify([
              journalWorkspace?.scope.productUserId ?? 'local',
              personalizationLayout,
            ]),
            layout: personalizationLayout,
            value: layoutProfile.dayGraph ?? DEFAULT_DAY_GRAPH_PREFERENCES,
            hydrated: personalization !== undefined,
            ...(onPersonalizationChange === undefined
              ? {}
              : {
                  onSave: value =>
                    onPersonalizationChange(current =>
                      updateDayGraphPreferences(
                        current,
                        personalizationLayout,
                        value,
                      ),
                    ),
                }),
          },
        }
      : undefined;
  const activeDailyOverviewRuntime: DailyOverviewModuleRuntime | undefined =
    dailyOverviewRuntime
      ? {
          ...dailyOverviewRuntime,
          layoutPreferences: {
            scopeKey: JSON.stringify([
              journalWorkspace?.scope.productUserId ?? 'local',
              personalizationLayout,
            ]),
            layout: personalizationLayout,
            value:
              layoutProfile.dailyOverview ?? DEFAULT_DAILY_OVERVIEW_PREFERENCES,
            hydrated: personalization !== undefined,
            ...(onPersonalizationChange === undefined
              ? {}
              : {
                  onSave: value =>
                    onPersonalizationChange(
                      current =>
                        updateDailyOverviewPreferences(
                          current,
                          personalizationLayout,
                          value,
                        ),
                      {optimistic: false},
                    ),
                }),
          },
        }
      : undefined;
  const activeShellPreferences =
    shellPreferences ?? layoutProfile.shell ?? DEFAULT_SHELL_PREFERENCES;
  const configuration = useMemo(
    () =>
      resolveProductShellConfiguration(
        destinationRegistry,
        activeShellPreferences,
        runtime,
      ),
    [activeShellPreferences, destinationRegistry, runtime],
  );
  const [state, baseDispatch] = useReducer(
    productShellReducer,
    configuration,
    createInitialProductShellState,
  );
  const [sessionRecents, setSessionRecents] = useState<
    readonly RecentDestination[]
  >([]);
  const [customizingStage, setCustomizingStage] = useState<
    PersonalizationQuestionnaireStage | undefined
  >();
  const outbox = useSyncExternalStore(
    journalWorkspace?.outbox.subscribe ?? subscribeToNothing,
    journalWorkspace?.outbox.getSnapshot ?? getEmptyOutbox,
    journalWorkspace?.outbox.getSnapshot ?? getEmptyOutbox,
  );
  const updateCenterRepository = alertsRuntime?.updateCenter.repository;
  const updateSnapshot = useSyncExternalStore(
    updateCenterRepository?.subscribe ?? subscribeToNothing,
    updateCenterRepository?.getSnapshot ?? getEmptyUpdateSnapshot,
    updateCenterRepository?.getSnapshot ?? getEmptyUpdateSnapshot,
  );
  useEffect(() => {
    updateCenterRepository?.refresh().catch(() => undefined);
  }, [updateCenterRepository]);
  const operationalBadges = useMemo(
    () =>
      new Map([
        ...selectJournalOperationalBadges(outbox, locale),
        ...selectAlertOperationalBadges(updateSnapshot, locale),
      ]),
    [locale, outbox, updateSnapshot],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (customizingStage !== undefined) {
          setCustomizingStage(undefined);
          return true;
        }
        if (state.stack.length <= 1) {
          return false;
        }
        baseDispatch({type: 'back'});
        return true;
      },
    );
    return () => subscription.remove();
  }, [customizingStage, state.stack.length]);
  const storedRecents: readonly RecentDestination[] =
    activePersonalization.device.recentModules.map(recent => ({
      target: recent.target,
      visitedAt: recent.visitedAt,
    }));
  const recents =
    personalization === undefined ? sessionRecents : storedRecents;
  const hubModel = useMemo(
    () =>
      selectHubViewModel(destinationRegistry, {
        locale,
        runtime,
        preferences: {
          favorites:
            personalization === undefined
              ? DEFAULT_FAVORITES
              : activePersonalization.account.favorites,
          hiddenModuleIds: new Set(
            activePersonalization.account.hiddenModules.map(
              target => target.destinationId,
            ),
          ),
          recents,
        },
        operationalBadges,
      }),
    [
      activePersonalization.account.favorites,
      activePersonalization.account.hiddenModules,
      destinationRegistry,
      locale,
      personalization,
      recents,
      operationalBadges,
      runtime,
    ],
  );

  const snapshotForHub = useMemo<CurrentSnapshotViewModel | undefined>(() => {
    if (!layoutProfile.showCurrentSnapshot) {
      return undefined;
    }
    return (
      currentSnapshot ?? {
        status: 'loading',
        target: selectCurrentSnapshotTarget(destinationRegistry, {
          runtime,
        }),
      }
    );
  }, [
    currentSnapshot,
    destinationRegistry,
    layoutProfile.showCurrentSnapshot,
    runtime,
  ]);

  const recordVisit = (destination: AvailableDestinationTarget) => {
    const target = createStoredDestinationTarget(
      destination.destination.ownerModuleId,
    );
    const visitedAt = Date.now();
    if (personalization !== undefined && onPersonalizationChange) {
      onPersonalizationChange(current =>
        recordRecentModule(current, target, visitedAt),
      ).catch(() => {
        // Navigation must remain available if preference persistence fails.
      });
      return;
    }
    setSessionRecents(current =>
      [
        {target, visitedAt},
        ...current.filter(
          item => item.target.destinationId !== target.destinationId,
        ),
      ].slice(0, 8),
    );
  };

  const dispatchProductAction = (action: ProductShellAction) => {
    // Customisation is rendered in the Hub slot rather than as a Shell route.
    // Every Shell control must still leave it, especially the always-available
    // Hub control promised by the navigation model.
    if (customizingStage !== undefined) {
      setCustomizingStage(undefined);
    }
    if (action.type === 'open-destination') {
      recordVisit(action.request.destination);
    }
    baseDispatch(action);
  };

  const openDestination = (destination: AvailableDestinationTarget) =>
    dispatchProductAction({
      type: 'open-destination',
      request: createDestinationRequest(destination),
    });

  const openDestinationRequest = (request: DestinationRequest) => {
    const activeWorkspaceId = journalWorkspace?.scope.workspaceId;
    if (
      request.workspaceId !== undefined &&
      request.workspaceId !== activeWorkspaceId
    ) {
      return;
    }
    const scopedRequest =
      request.focus !== undefined &&
      request.workspaceId === undefined &&
      activeWorkspaceId !== undefined
        ? {...request, workspaceId: activeWorkspaceId}
        : request;
    dispatchProductAction({type: 'open-destination', request: scopedRequest});
  };

  const openDestinationRequestRef = useRef(openDestinationRequest);
  openDestinationRequestRef.current = openDestinationRequest;
  const consumedNavigationIntentId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      navigationIntent === undefined ||
      consumedNavigationIntentId.current === navigationIntent.id
    ) {
      return;
    }
    consumedNavigationIntentId.current = navigationIntent.id;
    openDestinationRequestRef.current(navigationIntent.request);
    onNavigationIntentConsumed?.(navigationIntent.id);
  }, [navigationIntent, onNavigationIntentConsumed]);

  const openLegacyDestination = (destination: AvailableDestinationTarget) => {
    recordVisit(destination);
    onOpenLegacy?.(destination);
  };

  const renderJournalUnavailable = () => (
    <View style={styles.loadingModule}>
      <Text style={styles.bridgeNote}>
        {journalError ?? BRIDGE_COPY[locale].loading}
      </Text>
    </View>
  );

  const questionnaireIncomplete =
    activePersonalization.workspace.questionnaire.status === 'not-started' ||
    activePersonalization.workspace.questionnaire.status === 'in-progress';

  if (
    personalization !== undefined &&
    onPersonalizationChange !== undefined &&
    questionnaireIncomplete
  ) {
    return (
      <PersonalizationQuestionnaireView
        layout={personalizationLayout}
        locale={locale}
        mode="onboarding"
        onSave={async next => {
          await onPersonalizationChange(next);
          const nextProfile = selectLayoutProfile(next, personalizationLayout);
          const nextConfiguration = resolveProductShellConfiguration(
            destinationRegistry,
            nextProfile.shell,
            runtime,
          );
          if (
            nextConfiguration.start.kind === 'destination' &&
            nextConfiguration.start.resolved.status === 'available'
          ) {
            baseDispatch({
              type: 'open-destination',
              request: createDestinationRequest(
                nextConfiguration.start.resolved,
              ),
            });
          }
        }}
        value={activePersonalization}
      />
    );
  }

  return (
    <ProductShellView
      configuration={configuration}
      dispatch={dispatchProductAction}
      locale={locale}
      registry={destinationRegistry}
      renderDestination={({destination, request}) => {
        const rendered = implementationRegistry.render({
          destination,
          request,
          locale,
          registry: destinationRegistry,
          runtime,
          onOpenDestination: openDestination,
          onOpenDestinationRequest: openDestinationRequest,
          renderJournalUnavailable,
          ...(activeTrendsRuntime === undefined
            ? {}
            : {trendsRuntime: activeTrendsRuntime}),
          ...(activeDailyOverviewRuntime === undefined
            ? {}
            : {dailyOverviewRuntime: activeDailyOverviewRuntime}),
          ...(activeDayGraphRuntime === undefined
            ? {}
            : {dayGraphRuntime: activeDayGraphRuntime}),
          ...(previousDaySummaryRuntime === undefined
            ? {}
            : {previousDaySummaryRuntime}),
          ...(alertsRuntime === undefined ? {} : {alertsRuntime}),
          ...(similarEventsRuntime === undefined ? {} : {similarEventsRuntime}),
          ...(loopChangesRuntime === undefined ? {} : {loopChangesRuntime}),
          ...(settingsRuntime === undefined ? {} : {settingsRuntime}),
          ...(aiRuntime === undefined ? {} : {aiRuntime}),
          ...(onPersonalizationChange === undefined
            ? {}
            : {
                onCustomizePersonalization: () =>
                  setCustomizingStage('relationship'),
              }),
          ...(journalWorkspace === undefined ? {} : {journalWorkspace}),
          ...(mealImagesRuntime === undefined ? {} : {mealImagesRuntime}),
          ...(onOpenLegacy === undefined
            ? {}
            : {onOpenLegacy: openLegacyDestination}),
        });
        return rendered === undefined ? (
          <ModuleBridge
            destination={destination}
            locale={locale}
            {...(onOpenLegacy === undefined
              ? {}
              : {onOpenLegacy: openLegacyDestination})}
          />
        ) : (
          rendered
        );
      }}
      renderHub={() =>
        customizingStage !== undefined && onPersonalizationChange ? (
          <PersonalizationQuestionnaireView
            initialStage={customizingStage}
            layout={personalizationLayout}
            locale={locale}
            mode="customize"
            onCancel={() => setCustomizingStage(undefined)}
            onSave={async next => {
              await onPersonalizationChange(next);
              setCustomizingStage(undefined);
            }}
            value={activePersonalization}
          />
        ) : (
          <HubView
            {...(snapshotForHub === undefined
              ? {}
              : {currentSnapshot: snapshotForHub})}
            model={hubModel}
            {...(onPersonalizationChange === undefined
              ? {}
              : {
                  onCustomize: (stage?: 'quick-access') =>
                    setCustomizingStage(stage ?? 'relationship'),
                })}
            onOpenDestination={openDestination}
            showRecents={layoutProfile.showRecents}
          />
        )
      }
      runtime={runtime}
      state={state}
    />
  );
};

const styles = StyleSheet.create({
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  bridge: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FA',
    padding: 28,
  },
  bridgeTitle: {
    maxWidth: 560,
    width: '100%',
    color: '#17202A',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    textAlign: 'center',
  },
  bridgeDescription: {
    maxWidth: 560,
    color: '#5C6875',
    fontSize: 17,
    lineHeight: 25,
    marginTop: 10,
    textAlign: 'center',
  },
  bridgeNote: {
    maxWidth: 560,
    color: '#5C6875',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 18,
    textAlign: 'center',
  },
  bridgeButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1769AA',
    borderRadius: 24,
    marginTop: 22,
    paddingHorizontal: 22,
  },
  bridgeButtonLabel: {color: '#FFFFFF', fontSize: 15, fontWeight: '700'},
  pressed: {opacity: 0.72},
  loadingModule: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FA',
    padding: 24,
  },
});
