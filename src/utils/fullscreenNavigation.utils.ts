import {StackActions} from '@react-navigation/native';

import {FULL_SCREEN_VIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {dispatchToParentOrSelf} from 'app/utils/navigationDispatch.utils';
import type {FullScreenStackedChartsParams} from 'app/utils/stackedChartsData.utils';

/**
 * Pushes a FullScreenViewScreen route with stacked charts params.
 *
 * Centralizes the "dispatch to parent navigator" behavior so call sites don't
 * duplicate StackActions + fallback navigation logic.
 */
export function pushFullScreenStackedCharts(params: {
  navigation: any;
  payload: FullScreenStackedChartsParams;
}): void {
  const {navigation, payload} = params;

  const action = StackActions.push(FULL_SCREEN_VIEW_SCREEN, payload);
  dispatchToParentOrSelf({
    navigation,
    action,
    fallbackNavigate: () => (navigation as any).navigate?.(FULL_SCREEN_VIEW_SCREEN, payload),
  });
}
