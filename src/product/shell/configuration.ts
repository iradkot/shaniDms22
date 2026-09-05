import {
  resolveDestinationTarget,
  type DestinationRegistry,
  type DestinationRuntimeContext,
} from '../destinations';
import type {ResolvedProductShellConfiguration} from './types';
import {parseProductShellPreferences} from './validation';

/** Resolves policy and runtime availability without discarding saved choices. */
export const resolveProductShellConfiguration = (
  registry: DestinationRegistry,
  untrustedPreferences: unknown,
  runtime: DestinationRuntimeContext,
): ResolvedProductShellConfiguration => {
  const stored = parseProductShellPreferences(untrustedPreferences);
  const start = stored.startDestination
    ? {
        kind: 'destination' as const,
        resolved: resolveDestinationTarget(
          registry,
          stored.startDestination,
          'start',
          runtime,
        ),
      }
    : {kind: 'hub' as const};

  return {
    stored,
    start,
    shortcuts: stored.shortcuts.map(shortcut =>
      resolveDestinationTarget(registry, shortcut, 'shortcut', runtime),
    ),
  };
};
