/**
 * Best-effort dispatch helper for nested navigators.
 *
 * Many screens live under a tab navigator while the target route is registered
 * on a parent stack. Prefer dispatching to the parent when available.
 */
export function dispatchToParentOrSelf(params: {
  navigation: any;
  action: any;
  fallbackNavigate?: () => void;
}): void {
  const {navigation, action, fallbackNavigate} = params;

  try {
    const parent = navigation?.getParent?.();
    if (parent?.dispatch) {
      parent.dispatch(action);
      return;
    }
  } catch {
    // Continue to self-dispatch fallback.
  }

  try {
    if (navigation?.dispatch) {
      navigation.dispatch(action);
      return;
    }
  } catch {
    // Continue to navigate fallback.
  }

  try {
    fallbackNavigate?.();
  } catch {
    // Swallow: best-effort helper.
  }
}
