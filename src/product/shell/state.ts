import type {
  DestinationFocus,
  DestinationRequest,
  ProductShellAction,
  ProductShellStack,
  ProductShellState,
  ResolvedProductShellConfiguration,
  ShellDestinationRoute,
  ShellHubRoute,
} from './types';

export const HUB_ROUTE: ShellHubRoute = Object.freeze({kind: 'hub'});

const hubOnlyState = (
  forward: readonly ShellDestinationRoute[] = [],
): ProductShellState => ({stack: [HUB_ROUTE], forward});

const sameFocus = (
  left: DestinationFocus | undefined,
  right: DestinationFocus | undefined,
): boolean => {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case 'day':
      return (
        right.kind === 'day' &&
        left.dayStartMs === right.dayStartMs &&
        left.atMs === right.atMs
      );
    case 'period':
      return (
        right.kind === 'period' &&
        left.startMs === right.startMs &&
        left.endMs === right.endMs
      );
    case 'journal-entry':
      return (
        right.kind === 'journal-entry' &&
        left.entryKind === right.entryKind &&
        left.entryId === right.entryId
      );
    case 'external-record':
      return (
        right.kind === 'external-record' &&
        left.recordKind === right.recordKind &&
        left.recordId === right.recordId
      );
    case 'alert-occurrence':
      return (
        right.kind === 'alert-occurrence' &&
        left.occurrenceId === right.occurrenceId
      );
    case 'loop-change':
      return right.kind === 'loop-change' && left.changeId === right.changeId;
    case 'ai-conversation':
      return (
        right.kind === 'ai-conversation' &&
        left.conversationId === right.conversationId
      );
  }
};

const routeFromRequest = (
  request: DestinationRequest,
): ShellDestinationRoute => ({
  kind: 'destination',
  target: request.destination.target,
  ...(request.workspaceId === undefined
    ? {}
    : {workspaceId: request.workspaceId}),
  ...(request.focus === undefined ? {} : {focus: request.focus}),
});

/** An unavailable configured start safely falls back to the Hub root. */
export const createInitialProductShellState = (
  configuration: ResolvedProductShellConfiguration,
): ProductShellState => {
  if (
    configuration.start.kind === 'destination' &&
    configuration.start.resolved.status === 'available'
  ) {
    return {
      stack: [
        HUB_ROUTE,
        {
          kind: 'destination',
          target: configuration.start.resolved.target,
        },
      ],
      forward: [],
    };
  }
  return hubOnlyState();
};

export const productShellReducer = (
  state: ProductShellState,
  action: ProductShellAction,
): ProductShellState => {
  switch (action.type) {
    case 'open-destination': {
      const current = state.stack[state.stack.length - 1];
      const {request} = action;
      if (
        current?.kind === 'destination' &&
        current.target.destinationId ===
          request.destination.target.destinationId &&
        current.workspaceId === request.workspaceId &&
        sameFocus(current.focus, request.focus)
      ) {
        return state;
      }
      return {
        stack: [...state.stack, routeFromRequest(request)],
        forward: [],
      };
    }
    case 'back': {
      if (state.stack.length === 1) {
        return state;
      }
      return {
        stack: state.stack.slice(0, -1) as unknown as ProductShellStack,
        forward: [
          state.stack[state.stack.length - 1] as ShellDestinationRoute,
          ...state.forward,
        ],
      };
    }
    case 'forward': {
      const next = state.forward[0];
      if (!next) {
        return state;
      }
      return {
        stack: [...state.stack, next],
        forward: state.forward.slice(1),
      };
    }
    case 'hub':
      if (state.stack.length === 1) {
        return state;
      }
      return hubOnlyState([
        ...(state.stack.slice(1) as readonly ShellDestinationRoute[]),
        ...state.forward,
      ]);
  }
};

export const selectCurrentShellRoute = (state: ProductShellState) =>
  state.stack[state.stack.length - 1] ?? HUB_ROUTE;

export const selectCanGoBack = (state: ProductShellState): boolean =>
  state.stack.length > 1;

export const selectCanGoForward = (state: ProductShellState): boolean =>
  state.forward.length > 0;
