import React, {useEffect, useMemo, useState} from 'react';
import {
  assertTherapyContextSnapshot,
  evaluateTherapyContextAvailability,
  type TherapyContextDataSource,
  type TherapyContextQualityGateInput,
} from '../../modules/trends';
import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from '../destinations';
import type {
  AvailableDestinationTarget,
  DestinationLocale,
  DestinationRegistry,
  DestinationRuntimeContext,
  ResolvedDestinationTarget,
} from '../destinations';
import {DestinationTileGroup, ProductPage} from '../ui';
import type {TrendsModuleRuntime} from './runtime';

const THERAPY_CONTEXT_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;
const systemNow = (): number => Date.now();

const PRIMARY_DESTINATIONS = [
  CORE_DESTINATION_IDS.trendsOverview,
  CORE_DESTINATION_IDS.trendsAgpDailyPatterns,
  CORE_DESTINATION_IDS.trendsComparePeriods,
] as const;

const CONTEXTUAL_DESTINATIONS = [
  CORE_DESTINATION_IDS.hypoInvestigation,
  CORE_DESTINATION_IDS.loopChangesImpact,
] as const;

const SECONDARY_DESTINATIONS = [
  CORE_DESTINATION_IDS.trendsTherapyContext,
] as const;

const COPY = {
  en: {
    title: 'Trends',
    subtitle: 'Choose the question you want the data to answer.',
    primary: 'Explore trends',
    related: 'Focused investigations',
    extensions: 'More in Trends',
    secondary: 'Therapy context',
  },
  he: {
    title: 'מגמות',
    subtitle: 'בחרו את השאלה שעליה תרצו שהנתונים יענו.',
    primary: 'חקירת מגמות',
    related: 'חקירות ממוקדות',
    extensions: 'עוד במגמות',
    secondary: 'הקשר טיפולי',
  },
} as const;

export interface TrendsLandingViewProps {
  readonly locale: DestinationLocale;
  readonly runtime: DestinationRuntimeContext;
  readonly registry?: DestinationRegistry;
  readonly onOpenDestination: (destination: AvailableDestinationTarget) => void;
  readonly therapyContext?: TrendsModuleRuntime['therapyContext'];
  readonly now?: () => number;
}

const resolveMany = (
  registry: DestinationRegistry,
  ids: readonly string[],
  runtime: DestinationRuntimeContext,
): readonly ResolvedDestinationTarget[] =>
  ids.map(id =>
    resolveDestinationTarget(
      registry,
      createStoredDestinationTarget(id),
      undefined,
      runtime,
    ),
  );

export const TrendsLandingView = ({
  locale,
  registry = coreDestinationRegistry,
  runtime,
  onOpenDestination,
  therapyContext,
  now = systemNow,
}: TrendsLandingViewProps) => {
  const dataSource = therapyContext?.dataSource;
  const initialQuality = therapyContext?.quality;
  const [loadedQuality, setLoadedQuality] = useState<{
    readonly dataSource: TherapyContextDataSource;
    readonly quality: TherapyContextQualityGateInput;
  }>();
  // Opening Trends activates this optional evidence read. The app host only
  // provides the capability, so Hub/Day Graph startup does no historical work.
  useEffect(() => {
    if (dataSource === undefined || initialQuality !== undefined) {
      return undefined;
    }
    let active = true;
    const endMs = now();
    const period = {startMs: endMs - THERAPY_CONTEXT_PERIOD_MS, endMs};
    dataSource
      .loadTherapyContext(period)
      .then(snapshot => {
        if (!active) {
          return;
        }
        assertTherapyContextSnapshot(snapshot);
        if (
          snapshot.period.startMs !== period.startMs ||
          snapshot.period.endMs !== period.endMs
        ) {
          throw new Error('Therapy Context returned a different period.');
        }
        setLoadedQuality({dataSource, quality: snapshot.quality});
      })
      .catch(() => {
        if (active) {
          setLoadedQuality(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [dataSource, initialQuality, now]);
  const therapyContextQuality =
    initialQuality ??
    (loadedQuality?.dataSource === dataSource
      ? loadedQuality?.quality
      : undefined);
  const primary = useMemo(
    () => resolveMany(registry, PRIMARY_DESTINATIONS, runtime),
    [registry, runtime],
  );
  const contextual = useMemo(
    () => resolveMany(registry, CONTEXTUAL_DESTINATIONS, runtime),
    [registry, runtime],
  );
  const secondary = useMemo(() => {
    if (
      therapyContextQuality === undefined ||
      !evaluateTherapyContextAvailability(therapyContextQuality).available
    ) {
      return [];
    }
    return resolveMany(registry, SECONDARY_DESTINATIONS, runtime).filter(
      (destination): destination is AvailableDestinationTarget =>
        destination.status === 'available',
    );
  }, [registry, runtime, therapyContextQuality]);
  const extensions = useMemo(() => {
    const ownedIds = new Set<string>([
      ...PRIMARY_DESTINATIONS,
      ...SECONDARY_DESTINATIONS,
    ]);
    return registry.destinations
      .filter(
        destination =>
          destination.kind === 'module-child' &&
          destination.ownerModuleId === CORE_DESTINATION_IDS.trends &&
          !ownedIds.has(destination.id),
      )
      .map(destination =>
        resolveDestinationTarget(
          registry,
          createStoredDestinationTarget(destination.id),
          undefined,
          runtime,
        ),
      );
  }, [registry, runtime]);
  const copy = COPY[locale];

  return (
    <ProductPage
      locale={locale}
      subtitle={copy.subtitle}
      testID="trends-landing-view"
      title={copy.title}>
      <DestinationTileGroup
        destinations={primary}
        locale={locale}
        onOpen={onOpenDestination}
        testIDPrefix="trends-destination"
        title={copy.primary}
      />

      {secondary.length > 0 ? (
        <DestinationTileGroup
          destinations={secondary}
          locale={locale}
          onOpen={onOpenDestination}
          testIDPrefix="trends-destination"
          title={copy.secondary}
        />
      ) : null}

      <DestinationTileGroup
        destinations={contextual}
        locale={locale}
        onOpen={onOpenDestination}
        testIDPrefix="trends-destination"
        title={copy.related}
      />

      {extensions.length > 0 ? (
        <DestinationTileGroup
          destinations={extensions}
          locale={locale}
          onOpen={onOpenDestination}
          testIDPrefix="trends-extension"
          title={copy.extensions}
        />
      ) : null}
    </ProductPage>
  );
};
