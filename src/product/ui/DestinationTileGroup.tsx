import React from 'react';
import type {
  AvailableDestinationTarget,
  DestinationLocale,
  ResolvedDestinationTarget,
} from '../destinations';
import {DestinationCard} from './DestinationCard';
import {ProductSection} from './ProductSection';
import {ResponsiveGrid} from './ResponsiveGrid';

export interface DestinationTileGroupProps {
  readonly title: string;
  readonly destinations: readonly ResolvedDestinationTarget[];
  readonly locale: DestinationLocale;
  readonly onOpen: (destination: AvailableDestinationTarget) => void;
  readonly testIDPrefix: string;
}

/**
 * Owns the category heading, responsive layout, stable card identity and
 * guarded Destination navigation for a group of Product choices.
 */
export const DestinationTileGroup = ({
  title,
  destinations,
  locale,
  onOpen,
  testIDPrefix,
}: DestinationTileGroupProps) => (
  <ProductSection locale={locale} title={title}>
    <ResponsiveGrid locale={locale}>
      {destinations.map(destination => (
        <DestinationCard
          destination={destination}
          key={destination.target.destinationId}
          locale={locale}
          onOpen={onOpen}
          testID={`${testIDPrefix}-${destination.target.destinationId}`}
        />
      ))}
    </ResponsiveGrid>
  </ProductSection>
);
