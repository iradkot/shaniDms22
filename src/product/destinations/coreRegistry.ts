import {CORE_DESTINATIONS, CORE_DESTINATION_IDS} from './coreDestinations';
import {assertCoreImplementationKeyCoverage} from './coreImplementationKeys';
import {DestinationRegistry} from './registry';
import type {DestinationId} from './types';

/** Old saved AI modes all open the current recommendation landing. */
export const CORE_SAVED_TARGET_REDIRECTS: ReadonlyMap<DestinationId, DestinationId> = new Map([
  CORE_DESTINATION_IDS.aiGeneralChat,
  CORE_DESTINATION_IDS.aiHypoSpecialist,
  CORE_DESTINATION_IDS.aiBehaviorSpecialist,
  CORE_DESTINATION_IDS.aiLoopSpecialist,
  CORE_DESTINATION_IDS.aiMealSpecialist,
].map(id => [id, CORE_DESTINATION_IDS.aiAnalyst]));

/** Validated at module bootstrap so an invalid core contribution fails atomically. */
assertCoreImplementationKeyCoverage(
  CORE_DESTINATIONS.map(destination => destination.implementationKey),
);
export const coreDestinationRegistry = new DestinationRegistry(
  CORE_DESTINATIONS,
  CORE_SAVED_TARGET_REDIRECTS,
);
