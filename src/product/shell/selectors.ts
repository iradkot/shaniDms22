import {
  CORE_DESTINATION_IDS,
  resolveDestinationTarget,
  type DestinationLocale,
  type DestinationRegistry,
  type DestinationRuntimeContext,
} from '../destinations';
import {
  selectCanGoBack,
  selectCanGoForward,
  selectCurrentShellRoute,
} from './state';
import type {
  ProductShellLayout,
  ProductShellState,
  ResolvedCurrentShellRoute,
  ResolvedProductShellConfiguration,
  ShellNavigationModel,
  ShellShortcutControl,
} from './types';

const SHELL_SHORTCUT_ICONS: Readonly<Record<string, string>> = {
  [CORE_DESTINATION_IDS.aiAnalyst]: 'auto-awesome',
  [CORE_DESTINATION_IDS.aiGeneralChat]: 'chat',
  [CORE_DESTINATION_IDS.updateCenter]: 'notifications',
  [CORE_DESTINATION_IDS.alertRules]: 'notifications-active',
};

const NAVIGATION_COPY = {
  en: {
    back: 'Back',
    forward: 'Forward',
    hub: 'Hub',
    unavailable: 'Unavailable',
    unknownShortcut: 'Saved shortcut',
  },
  he: {
    back: 'חזרה',
    forward: 'קדימה',
    hub: 'מרכז',
    unavailable: 'לא זמין',
    unknownShortcut: 'קיצור שמור',
  },
} as const;

export const getProductShellLayout = (
  viewportWidth: number,
  wideBreakpoint = 760,
): ProductShellLayout =>
  Number.isFinite(viewportWidth) && viewportWidth >= wideBreakpoint
    ? 'wide'
    : 'phone';

export const resolveCurrentProductShellRoute = (
  state: ProductShellState,
  registry: DestinationRegistry,
  runtime: DestinationRuntimeContext,
): ResolvedCurrentShellRoute => {
  const current = selectCurrentShellRoute(state);
  if (current.kind === 'hub') {
    return current;
  }
  const resolved = resolveDestinationTarget(
    registry,
    current.target,
    undefined,
    runtime,
  );
  return {
    kind: 'destination',
    resolved,
    request: {
      destination: resolved,
      ...(current.workspaceId === undefined
        ? {}
        : {workspaceId: current.workspaceId}),
      ...(current.focus === undefined ? {} : {focus: current.focus}),
    },
  };
};

const makeShortcutControl = (
  resolved: ResolvedProductShellConfiguration['shortcuts'][number],
  locale: DestinationLocale,
  currentDestinationId: string | undefined,
): ShellShortcutControl => {
  const copy = NAVIGATION_COPY[locale];
  const title =
    resolved.destination?.copy[locale].title ?? copy.unknownShortcut;
  return {
    key: resolved.destination?.id ?? resolved.target.destinationId,
    title,
    iconName: SHELL_SHORTCUT_ICONS[resolved.destination?.id ?? ''] ?? 'apps',
    active: resolved.target.destinationId === currentDestinationId,
    resolved,
    ...(resolved.status === 'unavailable'
      ? {unavailableLabel: copy.unavailable}
      : {}),
  };
};

export const selectShellNavigationModel = (
  state: ProductShellState,
  configuration: ResolvedProductShellConfiguration,
  locale: DestinationLocale,
): ShellNavigationModel => {
  const current = selectCurrentShellRoute(state);
  const currentDestinationId =
    current.kind === 'destination' ? current.target.destinationId : undefined;
  const copy = NAVIGATION_COPY[locale];
  return {
    locale,
    direction: locale === 'he' ? 'rtl' : 'ltr',
    back: {label: copy.back, disabled: !selectCanGoBack(state)},
    hub: {label: copy.hub, active: current.kind === 'hub'},
    forward: {label: copy.forward, disabled: !selectCanGoForward(state)},
    shortcuts: configuration.shortcuts
      .slice(0, 2)
      .map(shortcut =>
        makeShortcutControl(shortcut, locale, currentDestinationId),
      ),
  };
};
