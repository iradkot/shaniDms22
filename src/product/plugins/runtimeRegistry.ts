import type {ActivatedRuntimePlugin} from '../../modules/plugins';
import {
  ProductImplementationRegistry,
  coreProductImplementationRegistry,
} from '../app';
import {
  CORE_DESTINATIONS,
  DestinationDefinition,
  DestinationRegistry,
  destinationId,
} from '../destinations';
import {
  BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS,
  BUILT_IN_RUNTIME_PLUGIN_REGISTRATIONS,
} from './builtInImplementations';

const contributionFor = (
  active: ActivatedRuntimePlugin,
): DestinationDefinition | undefined => {
  const {payload} = active.manifest;
  const implementation = BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS.find(
    item => item.implementationId === payload.implementationId,
  );
  if (
    !implementation ||
    implementation.extensionId !== payload.extensionId ||
    implementation.publisherId !== payload.publisherId ||
    implementation.extensionPointId !== payload.extensionPointId
  ) {
    return undefined;
  }
  return {
    id: destinationId(payload.destination.id),
    kind: 'module-child',
    ownerModuleId: destinationId(implementation.ownerModuleId),
    implementationKey: implementation.implementationKey,
    order: payload.destination.order,
    copy: payload.destination.copy,
    targetPolicy: payload.destination.targetPolicy,
    availability: {
      platforms: payload.platforms,
      requiredCapabilities: [],
    },
  };
};

export interface RuntimeProductRegistries {
  readonly destinations: DestinationRegistry;
  readonly implementations: ProductImplementationRegistry;
}

/** Builds both registries atomically from already verified, healthy plugins. */
export const createRuntimeProductRegistries = (
  activePlugins: readonly ActivatedRuntimePlugin[],
): RuntimeProductRegistries => {
  const contributions = activePlugins.map(contributionFor).filter(
    (item): item is DestinationDefinition => item !== undefined,
  );
  const implementationKeys = new Set(
    contributions.map(item => item.implementationKey),
  );
  const registrations = BUILT_IN_RUNTIME_PLUGIN_REGISTRATIONS.filter(item =>
    implementationKeys.has(item.implementationKey),
  );
  return {
    destinations: new DestinationRegistry([
      ...CORE_DESTINATIONS,
      ...contributions,
    ]),
    implementations:
      registrations.length === 0
        ? coreProductImplementationRegistry
        : coreProductImplementationRegistry.extend(registrations),
  };
};
