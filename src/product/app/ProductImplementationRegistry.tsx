import React from 'react';
import {
  parseActivityEntryId,
  parseMealEntryId,
  type JournalWorkspace,
} from '../../modules/journal';
import type {UpdateDeepLinkDescriptor} from '../../modules/alerts';
import {AiAnalystModuleView, aiSpecialistForImplementationKey} from '../ai';
import type {AiAnalystModuleRuntime} from '../ai';
import {ActivitiesView} from '../activities';
import {AlertRulesView, UpdateCenterView} from '../alerts';
import type {AlertsModuleRuntime} from '../alerts';
import {SimilarEventsModuleView} from '../similarEvents';
import type {SimilarEventsModuleRuntime} from '../similarEvents';
import {LoopChangesModuleView} from '../loopChanges';
import type {LoopChangesModuleRuntime} from '../loopChanges';
import {SettingsModuleView} from '../settings';
import type {SettingsModuleRuntime} from '../settings';
import {DailyOverviewModuleView} from '../dailyOverview';
import type {DailyOverviewModuleRuntime} from '../dailyOverview';
import {DayGraphModuleView} from '../dayGraph';
import type {DayGraphModuleRuntime} from '../dayGraph';
import {PreviousDaySummaryModuleView} from '../previousDaySummary';
import type {PreviousDaySummaryModuleRuntime} from '../previousDaySummary';
import type {
  AvailableDestinationTarget,
  CoreImplementationKey,
  DestinationLocale,
  DestinationRegistry,
  DestinationRuntimeContext,
} from '../destinations';
import {
  CORE_DESTINATION_IDS,
  CORE_IMPLEMENTATION_KEYS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  isCoreImplementationKey,
  resolveDestinationTarget,
} from '../destinations';
import {MealsView} from '../meals';
import type {MealImagesRuntime} from '../../modules/mealMedia';
import {createDestinationRequest} from '../shell';
import type {DestinationFocus, DestinationRequest} from '../shell';
import {HypoInvestigationModuleView} from '../hypoInvestigation';
import {
  AgpModuleView,
  ComparePeriodsModuleView,
  TherapyContextModuleView,
  TrendsLandingView,
  TrendsOverviewModuleView,
} from '../trends';
import type {TrendsModuleRuntime} from '../trends';

export interface ProductImplementationHost {
  readonly locale: DestinationLocale;
  readonly runtime: DestinationRuntimeContext;
  readonly registry?: DestinationRegistry;
  readonly journalWorkspace?: JournalWorkspace;
  readonly mealImagesRuntime?: MealImagesRuntime;
  readonly destination: AvailableDestinationTarget;
  readonly request: DestinationRequest;
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
  readonly onCustomizePersonalization?: () => void;
  readonly onOpenDestination: (destination: AvailableDestinationTarget) => void;
  readonly onOpenDestinationRequest: (request: DestinationRequest) => void;
  readonly onOpenLegacy?: (destination: AvailableDestinationTarget) => void;
  readonly renderJournalUnavailable: () => React.ReactNode;
}

export interface ProductImplementationRegistration<
  ImplementationKey extends string = string,
> {
  readonly implementationKey: ImplementationKey;
  readonly render: (host: ProductImplementationHost) => React.ReactNode;
}

const validateRegistration = (
  registration: ProductImplementationRegistration,
): void => {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(registration.implementationKey)) {
    throw new Error(
      `Invalid Product implementation key: ${registration.implementationKey}`,
    );
  }
  if (typeof registration.render !== 'function') {
    throw new Error(
      `Product implementation ${registration.implementationKey} needs a renderer.`,
    );
  }
};

/** Typed extension Seam between Destination metadata and product Modules. */
export class ProductImplementationRegistry {
  private readonly registrations: readonly ProductImplementationRegistration[];
  private readonly renderers: ReadonlyMap<
    string,
    ProductImplementationRegistration['render']
  >;

  constructor(registrations: readonly ProductImplementationRegistration[]) {
    const renderers = new Map<
      string,
      ProductImplementationRegistration['render']
    >();
    registrations.forEach(registration => {
      validateRegistration(registration);
      if (renderers.has(registration.implementationKey)) {
        throw new Error(
          `Duplicate Product implementation: ${registration.implementationKey}`,
        );
      }
      renderers.set(registration.implementationKey, registration.render);
    });
    this.registrations = Object.freeze([...registrations]);
    this.renderers = renderers;
  }

  has(implementationKey: string): boolean {
    return this.renderers.has(implementationKey);
  }

  render(host: ProductImplementationHost): React.ReactNode | undefined {
    return this.renderers.get(host.destination.destination.implementationKey)?.(
      host,
    );
  }

  /** Atomically adds reviewed implementations; duplicate keys fail closed. */
  extend(
    registrations: readonly ProductImplementationRegistration[],
  ): ProductImplementationRegistry {
    return new ProductImplementationRegistry([
      ...this.registrations,
      ...registrations,
    ]);
  }
}

type CoreDestinationId =
  (typeof CORE_DESTINATION_IDS)[keyof typeof CORE_DESTINATION_IDS];

const openCoreDestinationRequest = (
  host: ProductImplementationHost,
  destinationId: CoreDestinationId,
  focus: DestinationFocus,
): void => {
  const target = resolveDestinationTarget(
    coreDestinationRegistry,
    createStoredDestinationTarget(destinationId),
    undefined,
    host.runtime,
  );
  if (target.status !== 'available') {
    return;
  }
  host.onOpenDestinationRequest(
    createDestinationRequest(target, {
      focus,
      ...(host.request.workspaceId === undefined
        ? {}
        : {workspaceId: host.request.workspaceId}),
    }),
  );
};

const openCoreDestination = (
  host: ProductImplementationHost,
  destinationId: CoreDestinationId,
): void => {
  const target = resolveDestinationTarget(
    coreDestinationRegistry,
    createStoredDestinationTarget(destinationId),
    undefined,
    host.runtime,
  );
  if (target.status === 'available') {
    host.onOpenDestination(target);
  }
};

const openUpdateDeepLink = (
  host: ProductImplementationHost,
  descriptor: UpdateDeepLinkDescriptor,
): void => {
  switch (descriptor.kind) {
    case 'alert-occurrence':
      openCoreDestinationRequest(host, CORE_DESTINATION_IDS.updateCenter, {
        kind: 'alert-occurrence',
        occurrenceId: descriptor.occurrenceId,
      });
      return;
    case 'alert-rule':
      openCoreDestination(host, CORE_DESTINATION_IDS.alertRules);
      return;
    case 'day':
      openCoreDestinationRequest(host, CORE_DESTINATION_IDS.dayGraph, {
        kind: 'day',
        dayStartMs: descriptor.dayStartMs,
      });
      return;
    case 'journal-entry':
      openCoreDestinationRequest(
        host,
        descriptor.entryKind === 'meal'
          ? CORE_DESTINATION_IDS.meals
          : CORE_DESTINATION_IDS.activity,
        {
          kind: 'journal-entry',
          entryKind: descriptor.entryKind,
          entryId: descriptor.entryId,
        },
      );
      return;
    case 'ai-conversation':
      openCoreDestinationRequest(host, CORE_DESTINATION_IDS.aiGeneralChat, {
        kind: 'ai-conversation',
        conversationId: descriptor.conversationId,
      });
  }
};

const renderAiModule = (host: ProductImplementationHost): React.ReactNode => {
  if (!host.aiRuntime) {
    return undefined;
  }
  const implementationKey = host.destination.destination.implementationKey;
  const initialSpecialist = isCoreImplementationKey(implementationKey)
    ? aiSpecialistForImplementationKey(implementationKey)
    : undefined;
  return (
    <AiAnalystModuleView
      {...(host.request.focus === undefined ? {} : {focus: host.request.focus})}
      {...(initialSpecialist === undefined ? {} : {initialSpecialist})}
      locale={host.locale}
      runtime={host.aiRuntime}
    />
  );
};

const coreProductImplementationRegistrations = [
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.dayGraph,
    render: host =>
      host.dayGraphRuntime ? (
        <DayGraphModuleView
          dataSource={host.dayGraphRuntime.dataSource}
          locale={host.locale}
          onOpenJournalEntry={item => {
            if (
              item.kind === 'journal-meal' ||
              item.kind === 'journal-activity'
            ) {
              openCoreDestinationRequest(
                host,
                item.kind === 'journal-meal'
                  ? CORE_DESTINATION_IDS.meals
                  : CORE_DESTINATION_IDS.activity,
                {
                  kind: 'journal-entry',
                  entryKind: item.kind === 'journal-meal' ? 'meal' : 'activity',
                  entryId: item.identity.recordId,
                },
              );
            }
          }}
          {...(host.dayGraphRuntime.chartPreferences === undefined
            ? {}
            : {chartPreferences: host.dayGraphRuntime.chartPreferences})}
          {...(host.dayGraphRuntime.expectedSampleIntervalMs === undefined
            ? {}
            : {
                expectedSampleIntervalMs:
                  host.dayGraphRuntime.expectedSampleIntervalMs,
              })}
          {...(host.dayGraphRuntime.preMealAssistance === undefined
            ? {}
            : {
                preMealAssistance: {
                  ...host.dayGraphRuntime.preMealAssistance,
                  onOpenMeals:
                    host.dayGraphRuntime.preMealAssistance.onOpenMeals ??
                    (() =>
                      openCoreDestination(host, CORE_DESTINATION_IDS.meals)),
                  onOpenAi:
                    host.dayGraphRuntime.preMealAssistance.onOpenAi ??
                    (() =>
                      openCoreDestination(
                        host,
                        CORE_DESTINATION_IDS.aiAnalyst,
                      )),
                },
              })}
          {...(host.request.focus?.kind === 'day'
            ? {initialFocus: host.request.focus}
            : {})}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.dailyOverview,
    render: host =>
      host.dailyOverviewRuntime ? (
        <DailyOverviewModuleView
          dataSource={host.dailyOverviewRuntime.dataSource}
          locale={host.locale}
          thresholds={host.dailyOverviewRuntime.thresholds}
          {...(host.request.focus === undefined
            ? {}
            : {focus: host.request.focus})}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.previousDaySummary,
    render: host =>
      host.previousDaySummaryRuntime ? (
        <PreviousDaySummaryModuleView
          dataSource={host.previousDaySummaryRuntime.dataSource}
          {...(host.previousDaySummaryRuntime.expectedSampleIntervalMs ===
          undefined
            ? {}
            : {
                expectedSampleIntervalMs:
                  host.previousDaySummaryRuntime.expectedSampleIntervalMs,
              })}
          {...(host.request.focus === undefined
            ? {}
            : {focus: host.request.focus})}
          locale={host.locale}
          onOpenEvent={event => {
            if (host.previousDaySummaryRuntime?.onOpenEvent) {
              host.previousDaySummaryRuntime.onOpenEvent(event);
              return;
            }
            const localId = event.id.startsWith('journal:')
              ? event.id.slice('journal:'.length)
              : undefined;
            if (event.kind === 'meal' && localId) {
              openCoreDestinationRequest(host, CORE_DESTINATION_IDS.meals, {
                kind: 'journal-entry',
                entryKind: 'meal',
                entryId: localId,
              });
              return;
            }
            if (event.kind === 'activity' && localId) {
              openCoreDestinationRequest(host, CORE_DESTINATION_IDS.activity, {
                kind: 'journal-entry',
                entryKind: 'activity',
                entryId: localId,
              });
              return;
            }
            if (event.kind === 'alert') {
              openCoreDestinationRequest(
                host,
                CORE_DESTINATION_IDS.updateCenter,
                {kind: 'alert-occurrence', occurrenceId: event.id},
              );
              return;
            }
            const day = new Date(event.timestampMs);
            day.setHours(0, 0, 0, 0);
            openCoreDestinationRequest(host, CORE_DESTINATION_IDS.dayGraph, {
              kind: 'day',
              dayStartMs: day.getTime(),
              atMs: event.timestampMs,
            });
          }}
          thresholds={host.previousDaySummaryRuntime.thresholds}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.meals,
    render: host => {
      if (!host.journalWorkspace) {
        return host.renderJournalUnavailable();
      }
      const focusedId =
        host.request.focus?.kind === 'journal-entry' &&
        host.request.focus.entryKind === 'meal'
          ? parseMealEntryId(host.request.focus.entryId)
          : undefined;
      return (
        <MealsView
          locale={host.locale}
          {...(focusedId?.ok ? {focusedMealId: focusedId.value} : {})}
          {...(host.mealImagesRuntime === undefined
            ? {}
            : {imagesRuntime: host.mealImagesRuntime})}
          workspace={host.journalWorkspace.meals}
          {...(host.dayGraphRuntime === undefined
            ? {}
            : {
                outcomeDataSource: host.dayGraphRuntime.dataSource,
                ...(host.dayGraphRuntime.expectedSampleIntervalMs === undefined
                  ? {}
                  : {
                      outcomeExpectedSampleIntervalMs:
                        host.dayGraphRuntime.expectedSampleIntervalMs,
                    }),
              })}
        />
      );
    },
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.activity,
    render: host => {
      if (!host.journalWorkspace) {
        return host.renderJournalUnavailable();
      }
      const focusedId =
        host.request.focus?.kind === 'journal-entry' &&
        host.request.focus.entryKind === 'activity'
          ? parseActivityEntryId(host.request.focus.entryId)
          : undefined;
      return (
        <ActivitiesView
          locale={host.locale}
          {...(focusedId?.ok ? {focusedActivityId: focusedId.value} : {})}
          workspace={host.journalWorkspace.activities}
          {...(host.dayGraphRuntime === undefined
            ? {}
            : {
                outcomeDataSource: host.dayGraphRuntime.dataSource,
                ...(host.dayGraphRuntime.expectedSampleIntervalMs === undefined
                  ? {}
                  : {
                      outcomeExpectedSampleIntervalMs:
                        host.dayGraphRuntime.expectedSampleIntervalMs,
                    }),
              })}
        />
      );
    },
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.trends,
    render: host => (
      <TrendsLandingView
        locale={host.locale}
        onOpenDestination={host.onOpenDestination}
        registry={host.registry ?? coreDestinationRegistry}
        runtime={host.runtime}
        {...(host.trendsRuntime?.therapyContext === undefined
          ? {}
          : {
              therapyContext: host.trendsRuntime.therapyContext,
            })}
      />
    ),
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.trendsOverview,
    render: host =>
      host.trendsRuntime ? (
        <TrendsOverviewModuleView
          dataSource={host.trendsRuntime.dataSource}
          locale={host.locale}
          onOpenHypoInvestigation={period => {
            const target = resolveDestinationTarget(
              coreDestinationRegistry,
              createStoredDestinationTarget(
                CORE_DESTINATION_IDS.hypoInvestigation,
              ),
              undefined,
              host.runtime,
            );
            if (target.status !== 'available') {
              return;
            }
            host.onOpenDestinationRequest(
              createDestinationRequest(target, {
                focus: {
                  kind: 'period',
                  startMs: period.startMs,
                  endMs: period.endMs,
                },
              }),
            );
          }}
          {...(host.trendsRuntime.showGri === undefined
            ? {}
            : {showGri: host.trendsRuntime.showGri})}
          thresholds={host.trendsRuntime.thresholds}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.trendsAgpDailyPatterns,
    render: host =>
      host.trendsRuntime ? (
        <AgpModuleView
          dataSource={host.trendsRuntime.dataSource}
          locale={host.locale}
          onOpenDay={period =>
            openCoreDestinationRequest(host, CORE_DESTINATION_IDS.dayGraph, {
              kind: 'day',
              dayStartMs: period.dayStartMs,
            })
          }
          thresholds={host.trendsRuntime.thresholds}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.trendsComparePeriods,
    render: host =>
      host.trendsRuntime ? (
        <ComparePeriodsModuleView
          dataSource={host.trendsRuntime.dataSource}
          locale={host.locale}
          thresholds={host.trendsRuntime.thresholds}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.trendsTherapyContext,
    render: host => {
      const therapyContext = host.trendsRuntime?.therapyContext;
      return therapyContext ? (
        <TherapyContextModuleView
          dataSource={therapyContext.dataSource}
          locale={host.locale}
          {...(therapyContext.quality === undefined
            ? {}
            : {quality: therapyContext.quality})}
        />
      ) : undefined;
    },
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.hypoInvestigation,
    render: host => {
      if (!host.trendsRuntime) {
        return undefined;
      }
      const eventPeriod = (event: {
        readonly startMs: number;
        readonly endMs: number;
      }): DestinationFocus => ({
        kind: 'period',
        startMs: Math.max(1, event.startMs - 3 * 60 * 60 * 1000),
        endMs: event.endMs + 3 * 60 * 60 * 1000,
      });
      return (
        <HypoInvestigationModuleView
          dataSource={host.trendsRuntime.dataSource}
          {...(host.dayGraphRuntime === undefined
            ? {}
            : {contextDataSource: host.dayGraphRuntime.dataSource})}
          {...(host.request.focus === undefined
            ? {}
            : {focus: host.request.focus})}
          locale={host.locale}
          onAskAi={event =>
            openCoreDestinationRequest(
              host,
              CORE_DESTINATION_IDS.aiHypoSpecialist,
              eventPeriod(event),
            )
          }
          onFindSimilar={event =>
            openCoreDestinationRequest(
              host,
              CORE_DESTINATION_IDS.similarEvents,
              eventPeriod(event),
            )
          }
          onOpenDayGraph={event => {
            const day = new Date(event.startMs);
            day.setHours(0, 0, 0, 0);
            openCoreDestinationRequest(host, CORE_DESTINATION_IDS.dayGraph, {
              kind: 'day',
              dayStartMs: day.getTime(),
              atMs: event.startMs,
            });
          }}
          thresholds={host.trendsRuntime.thresholds}
        />
      );
    },
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.loopChangesImpact,
    render: host =>
      host.loopChangesRuntime ? (
        <LoopChangesModuleView
          {...(host.request.focus === undefined
            ? {}
            : {focus: host.request.focus})}
          locale={host.locale}
          runtime={{
            ...host.loopChangesRuntime,
            onOpenDayGraph: request =>
              openCoreDestinationRequest(host, CORE_DESTINATION_IDS.dayGraph, {
                kind: 'day',
                dayStartMs: request.dayStartMs,
              }),
            onAskAiAdvisor: request =>
              openCoreDestinationRequest(
                host,
                CORE_DESTINATION_IDS.aiLoopSpecialist,
                {kind: 'loop-change', changeId: request.changeId},
              ),
          }}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.similarEvents,
    render: host =>
      host.similarEventsRuntime ? (
        <SimilarEventsModuleView
          {...(host.request.focus === undefined
            ? {}
            : {focus: host.request.focus})}
          locale={host.locale}
          runtime={{
            ...host.similarEventsRuntime,
            onOpenDayGraph: event => {
              const day = new Date(event.startMs);
              day.setHours(0, 0, 0, 0);
              openCoreDestinationRequest(host, CORE_DESTINATION_IDS.dayGraph, {
                kind: 'day',
                dayStartMs: day.getTime(),
                atMs: event.startMs,
              });
            },
            onAskAi: event =>
              openCoreDestinationRequest(
                host,
                CORE_DESTINATION_IDS.aiGeneralChat,
                {
                  kind: 'period',
                  startMs: Math.max(1, event.startMs - 3 * 60 * 60 * 1000),
                  endMs: event.endMs + 3 * 60 * 60 * 1000,
                },
              ),
          }}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.updateCenter,
    render: host =>
      host.alertsRuntime ? (
        <UpdateCenterView
          {...(host.request.focus?.kind === 'alert-occurrence'
            ? {focusedOccurrenceId: host.request.focus.occurrenceId}
            : {})}
          locale={host.locale}
          onOpenDeepLink={descriptor => {
            host.alertsRuntime?.updateCenter.onOpenDeepLink?.(descriptor);
            openUpdateDeepLink(host, descriptor);
          }}
          repository={host.alertsRuntime.updateCenter.repository}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.alertRules,
    render: host =>
      host.alertsRuntime ? (
        <AlertRulesView
          locale={host.locale}
          repository={host.alertsRuntime.alertRules.repository}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.settings,
    render: host =>
      host.settingsRuntime ? (
        <SettingsModuleView
          dataSource={host.settingsRuntime.dataSource}
          locale={host.locale}
          {...(host.settingsRuntime.nightscoutConnection === undefined
            ? {}
            : {
                nightscoutConnection: host.settingsRuntime.nightscoutConnection,
              })}
          {...(host.onCustomizePersonalization === undefined
            ? {}
            : {onCustomize: host.onCustomizePersonalization})}
          onOpenSection={section => {
            if (section === 'alerts') {
              openCoreDestination(host, CORE_DESTINATION_IDS.alertRules);
              return;
            }
            host.settingsRuntime?.onOpenSection?.(section);
          }}
        />
      ) : undefined,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiAnalyst,
    render: renderAiModule,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiGeneralChat,
    render: renderAiModule,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiHypoSpecialist,
    render: renderAiModule,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiBehaviorSpecialist,
    render: renderAiModule,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiLoopSpecialist,
    render: renderAiModule,
  },
  {
    implementationKey: CORE_IMPLEMENTATION_KEYS.aiMealSpecialist,
    render: renderAiModule,
  },
] as const satisfies readonly ProductImplementationRegistration<CoreImplementationKey>[];

export const coreProductImplementationRegistry =
  new ProductImplementationRegistry(coreProductImplementationRegistrations);
