import {CORE_DESTINATIONS} from './coreDestinations';
import {assertCoreImplementationKeyCoverage} from './coreImplementationKeys';
import {DestinationRegistry} from './registry';

/** Validated at module bootstrap so an invalid core contribution fails atomically. */
assertCoreImplementationKeyCoverage(
  CORE_DESTINATIONS.map(destination => destination.implementationKey),
);
export const coreDestinationRegistry = new DestinationRegistry(
  CORE_DESTINATIONS,
);
