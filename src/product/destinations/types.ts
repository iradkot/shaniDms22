export const DESTINATION_GROUPS = [
  'today',
  'understand',
  'ask',
  'record',
  'updates',
  'manage',
] as const;

export type DestinationGroupId = (typeof DESTINATION_GROUPS)[number];

export const DESTINATION_PLATFORMS = ['ios', 'android', 'web'] as const;

export type DestinationPlatform = (typeof DESTINATION_PLATFORMS)[number];

export const DESTINATION_TARGET_PURPOSES = [
  'favorite',
  'start',
  'shortcut',
] as const;

export type DestinationTargetPurpose =
  (typeof DESTINATION_TARGET_PURPOSES)[number];

export type DestinationLocale = 'en' | 'he';

declare const destinationIdBrand: unique symbol;

/** A stable, namespaced identifier such as `core.day-graph`. */
export type DestinationId = string & {
  readonly [destinationIdBrand]: 'DestinationId';
};

export interface DestinationCopy {
  readonly title: string;
  readonly description: string;
}

export interface DestinationTargetPolicy {
  readonly favorite: boolean;
  readonly start: boolean;
  readonly shortcut: boolean;
}

export interface DestinationAvailabilityPolicy {
  readonly platforms: readonly DestinationPlatform[];
  readonly requiredCapabilities: readonly string[];
}

interface DestinationDefinitionBase {
  readonly id: DestinationId;
  readonly ownerModuleId: DestinationId;
  readonly implementationKey: string;
  readonly order: number;
  readonly copy: Readonly<Record<DestinationLocale, DestinationCopy>>;
  readonly targetPolicy: DestinationTargetPolicy;
  readonly availability: DestinationAvailabilityPolicy;
  readonly aliases?: readonly DestinationId[];
}

export interface ModuleDestinationDefinition extends DestinationDefinitionBase {
  readonly kind: 'module';
  readonly group: DestinationGroupId;
}

export interface ChildDestinationDefinition extends DestinationDefinitionBase {
  readonly kind: 'module-child';
  readonly group?: never;
}

export type DestinationDefinition =
  | ModuleDestinationDefinition
  | ChildDestinationDefinition;

/**
 * The only destination shape persisted in preferences.
 *
 * It intentionally has no context bag. Workspace IDs, date ranges, glucose
 * readings, filters, conversation text, and other medical payloads belong to
 * transient navigation state, never Favorites, start targets, or shortcuts.
 */
export interface StoredDestinationTarget {
  readonly schemaVersion: 1;
  readonly destinationId: DestinationId;
}

export interface DestinationRuntimeContext {
  readonly platform: DestinationPlatform;
  readonly capabilities?: ReadonlySet<string>;
  /** A host-controlled kill switch. The value must be safe to show to users. */
  readonly disabledDestinations?: ReadonlyMap<string, string>;
}

export type DestinationUnavailableCode =
  | 'unknown-destination'
  | 'unsupported-platform'
  | 'missing-capability'
  | 'disabled'
  | 'target-not-allowed';

export interface DestinationUnavailableReason {
  readonly code: DestinationUnavailableCode;
  readonly message: string;
}

export interface AvailableDestinationTarget {
  readonly status: 'available';
  readonly target: StoredDestinationTarget;
  readonly destination: DestinationDefinition;
  readonly migratedFrom?: DestinationId;
}

export interface UnavailableDestinationTarget {
  readonly status: 'unavailable';
  readonly target: StoredDestinationTarget;
  readonly destination?: DestinationDefinition;
  readonly migratedFrom?: DestinationId;
  readonly reason: DestinationUnavailableReason;
}

/** Resolution never drops the saved target, including unknown or disabled IDs. */
export type ResolvedDestinationTarget =
  | AvailableDestinationTarget
  | UnavailableDestinationTarget;
