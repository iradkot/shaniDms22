import type {
  AvailableDestinationTarget,
  DestinationLocale,
  ResolvedDestinationTarget,
  StoredDestinationTarget,
} from '../destinations';

/**
 * The complete persisted Product Shell preference shape.
 *
 * Destination targets contain IDs only. Dates, filters, Workspace IDs,
 * glucose values, conversations, and other medical context are never stored
 * in Shell preferences.
 */
export interface StoredProductShellPreferences {
  readonly schemaVersion: 1;
  readonly startDestination?: StoredDestinationTarget;
  readonly shortcuts: readonly StoredDestinationTarget[];
}

export type ResolvedShellStart =
  | {readonly kind: 'hub'}
  | {
      readonly kind: 'destination';
      readonly resolved: ResolvedDestinationTarget;
    };

export interface ResolvedProductShellConfiguration {
  readonly stored: StoredProductShellPreferences;
  readonly start: ResolvedShellStart;
  /** Always retains saved order, including unavailable shortcuts. */
  readonly shortcuts: readonly ResolvedDestinationTarget[];
}

export interface ShellHubRoute {
  readonly kind: 'hub';
}

/**
 * Typed, transient focus passed between Product destinations.
 *
 * These values are deliberately IDs and time boundaries only. They never
 * contain glucose samples, notes, prompts, or other medical payloads, and are
 * never written to Favorites, shortcuts, start preferences, or Recents.
 */
export type DestinationFocus =
  | {readonly kind: 'day'; readonly dayStartMs: number; readonly atMs?: number}
  | {
      readonly kind: 'period';
      readonly startMs: number;
      readonly endMs: number;
    }
  | {
      readonly kind: 'journal-entry';
      readonly entryKind: 'meal' | 'activity';
      readonly entryId: string;
    }
  | {
      readonly kind: 'external-record';
      readonly recordKind: 'carbohydrate' | 'treatment' | 'activity';
      readonly recordId: string;
    }
  | {
      readonly kind: 'alert-occurrence';
      readonly occurrenceId: string;
    }
  | {readonly kind: 'loop-change'; readonly changeId: string}
  | {readonly kind: 'ai-conversation'; readonly conversationId: string};

/**
 * In-memory navigation request. Unlike StoredDestinationTarget, this shape is
 * intentionally not serialisable through the preference codecs.
 */
export interface DestinationRequest {
  readonly destination: AvailableDestinationTarget;
  /** Identifies the active Workspace at the time the request was created. */
  readonly workspaceId?: string;
  readonly focus?: DestinationFocus;
}

/** One validated, transient request received from an OS notification/deep link. */
export interface ProductNavigationIntent {
  readonly id: string;
  readonly request: DestinationRequest;
}

export interface ShellDestinationRoute {
  readonly kind: 'destination';
  readonly target: StoredDestinationTarget;
  readonly workspaceId?: string;
  readonly focus?: DestinationFocus;
}

export type ProductShellRoute = ShellHubRoute | ShellDestinationRoute;

/** The first route is always the single Hub root. */
export type ProductShellStack = readonly [
  ShellHubRoute,
  ...ShellDestinationRoute[],
];

export interface ProductShellState {
  readonly stack: ProductShellStack;
  /** Transient browser-like history. It is never written to preferences. */
  readonly forward: readonly ShellDestinationRoute[];
}

export type ProductShellAction =
  | {
      readonly type: 'open-destination';
      readonly request: DestinationRequest;
    }
  | {readonly type: 'back'}
  | {readonly type: 'forward'}
  | {readonly type: 'hub'};

export type ResolvedCurrentShellRoute =
  | {readonly kind: 'hub'}
  | {
      readonly kind: 'destination';
      readonly resolved: ResolvedDestinationTarget;
      readonly request: {
        readonly destination: ResolvedDestinationTarget;
        readonly workspaceId?: string;
        readonly focus?: DestinationFocus;
      };
    };

export interface ShellShortcutControl {
  readonly key: string;
  readonly title: string;
  /** Decorative Material icon selected by the Shell for compact navigation. */
  readonly iconName: string;
  readonly active: boolean;
  readonly unavailableLabel?: string;
  readonly resolved: ResolvedDestinationTarget;
}

export interface ShellNavigationModel {
  readonly locale: DestinationLocale;
  readonly direction: 'ltr' | 'rtl';
  readonly back: {
    readonly label: string;
    readonly disabled: boolean;
  };
  readonly hub: {
    readonly label: string;
    readonly active: boolean;
  };
  readonly forward: {
    readonly label: string;
    readonly disabled: boolean;
  };
  readonly shortcuts: readonly ShellShortcutControl[];
}

export type ProductShellLayout = 'phone' | 'wide';
