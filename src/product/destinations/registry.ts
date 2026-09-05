import {
  DestinationDefinition,
  DestinationGroupId,
  DestinationId,
  DestinationRuntimeContext,
  DestinationTargetPurpose,
  DestinationUnavailableCode,
  ResolvedDestinationTarget,
  StoredDestinationTarget,
} from './types';
import {
  destinationId,
  parseDestinationDefinitions,
  parseStoredDestinationTarget,
} from './validation';

export class DestinationRegistry {
  readonly destinations: readonly DestinationDefinition[];

  private readonly byId: ReadonlyMap<string, DestinationDefinition>;
  private readonly aliases: ReadonlyMap<string, DestinationDefinition>;

  constructor(untrustedDefinitions: unknown) {
    const validated = parseDestinationDefinitions(untrustedDefinitions);
    this.destinations = Object.freeze([...validated]);
    this.byId = new Map(validated.map(item => [item.id, item]));

    const aliases = new Map<string, DestinationDefinition>();
    validated.forEach(item => {
      item.aliases?.forEach(alias => aliases.set(alias, item));
    });
    this.aliases = aliases;
  }

  get(id: string): DestinationDefinition | undefined {
    return this.byId.get(id);
  }

  getByIdOrAlias(id: string):
    | {
        readonly destination: DestinationDefinition;
        readonly migratedFrom?: DestinationId;
      }
    | undefined {
    const exact = this.byId.get(id);
    if (exact) {
      return {destination: exact};
    }
    const aliased = this.aliases.get(id);
    return aliased
      ? {destination: aliased, migratedFrom: id as DestinationId}
      : undefined;
  }

  modules(group?: DestinationGroupId): readonly DestinationDefinition[] {
    return this.destinations
      .filter(
        destination =>
          destination.kind === 'module' &&
          (group === undefined || destination.group === group),
      )
      .sort((left, right) => left.order - right.order);
  }
}

export const createStoredDestinationTarget = (
  id: string,
): StoredDestinationTarget => ({
  schemaVersion: 1,
  destinationId: destinationId(id),
});

const targetUnavailable = (
  target: StoredDestinationTarget,
  code: DestinationUnavailableCode,
  message: string,
  destination?: DestinationDefinition,
  migratedFrom?: DestinationId,
): ResolvedDestinationTarget => ({
  status: 'unavailable',
  target,
  ...(destination === undefined ? {} : {destination}),
  ...(migratedFrom === undefined ? {} : {migratedFrom}),
  reason: {code, message},
});

export const resolveDestinationTarget = (
  registry: DestinationRegistry,
  untrustedTarget: unknown,
  purpose: DestinationTargetPurpose | undefined,
  runtime: DestinationRuntimeContext,
): ResolvedDestinationTarget => {
  const target = parseStoredDestinationTarget(untrustedTarget);
  const match = registry.getByIdOrAlias(target.destinationId);
  if (!match) {
    return targetUnavailable(
      target,
      'unknown-destination',
      'This saved destination is no longer installed.',
    );
  }

  const {destination, migratedFrom} = match;
  if (purpose !== undefined && !destination.targetPolicy[purpose]) {
    return targetUnavailable(
      target,
      'target-not-allowed',
      `This destination cannot be used as a ${purpose}.`,
      destination,
      migratedFrom,
    );
  }

  if (!destination.availability.platforms.includes(runtime.platform)) {
    return targetUnavailable(
      target,
      'unsupported-platform',
      'This destination is not available on this device.',
      destination,
      migratedFrom,
    );
  }

  const disabledMessage =
    runtime.disabledDestinations?.get(destination.id) ??
    runtime.disabledDestinations?.get(target.destinationId);
  if (disabledMessage !== undefined) {
    return targetUnavailable(
      target,
      'disabled',
      disabledMessage || 'This destination is temporarily unavailable.',
      destination,
      migratedFrom,
    );
  }

  const capabilities = runtime.capabilities ?? new Set<string>();
  const missingCapability = destination.availability.requiredCapabilities.find(
    capability => !capabilities.has(capability),
  );
  if (missingCapability) {
    return targetUnavailable(
      target,
      'missing-capability',
      'This destination needs a connection or permission that is not available.',
      destination,
      migratedFrom,
    );
  }

  return {
    status: 'available',
    target,
    destination,
    ...(migratedFrom === undefined ? {} : {migratedFrom}),
  };
};
