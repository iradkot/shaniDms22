import type {
  DestinationRegistry,
  DestinationRuntimeContext,
} from '../../../product/destinations';
import {
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from '../../../product/destinations';
import {
  createDestinationRequest,
  DestinationRequestValidationError,
} from '../../../product/shell';
import type {
  DestinationFocus,
  ProductNavigationIntent,
} from '../../../product/shell';

type UnknownRecord = Readonly<Record<string, unknown>>;

export interface NativeProductNavigationIntentPayload {
  readonly id: string;
  readonly destinationId: string;
  readonly options?: {
    readonly workspaceId?: string;
    readonly focus?: DestinationFocus;
  };
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: UnknownRecord, keys: readonly string[]): boolean =>
  Object.keys(value).every(key => keys.includes(key));

const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= 512;

const defaultIntentId = (): string =>
  `product-intent-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

export const createNativeProductNavigationIntent = (
  destinationId: string,
  options: NativeProductNavigationIntentPayload['options'] = {},
  createId: () => string = defaultIntentId,
): NativeProductNavigationIntentPayload => ({
  id: createId(),
  destinationId,
  ...(Object.keys(options).length === 0 ? {} : {options}),
});

/** Strictly validates untrusted OS/navigation params before opening Product UI. */
export const decodeNativeProductNavigationIntent = (
  value: unknown,
  registry: DestinationRegistry,
  runtime: DestinationRuntimeContext,
): ProductNavigationIntent | undefined => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['id', 'destinationId', 'options']) ||
    !validId(value.id) ||
    !validId(value.destinationId)
  ) {
    return undefined;
  }
  const resolved = resolveDestinationTarget(
    registry,
    createStoredDestinationTarget(value.destinationId.trim()),
    undefined,
    runtime,
  );
  if (resolved.status !== 'available') {
    return undefined;
  }
  try {
    return {
      id: value.id.trim(),
      request: createDestinationRequest(resolved, value.options ?? {}),
    };
  } catch (error) {
    if (error instanceof DestinationRequestValidationError) {
      return undefined;
    }
    throw error;
  }
};
