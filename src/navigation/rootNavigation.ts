import {createNavigationContainerRef} from '@react-navigation/native';

import {
  HYPO_INVESTIGATION_SCREEN,
  PRODUCT_EXPERIENCE_SCREEN,
} from 'app/constants/SCREEN_NAMES';
import {CORE_DESTINATION_IDS} from 'app/product/destinations';
import {createNativeProductNavigationIntent} from 'app/platform/native/product';

export const rootNavigationRef = createNavigationContainerRef<any>();

type HypoInvestigationParams = {
  startMs?: number;
  endMs?: number;
  lowThreshold?: number;
};

export function navigateToHypoInvestigation(params?: HypoInvestigationParams) {
  if (!rootNavigationRef.isReady()) {
    return;
  }

  rootNavigationRef.navigate(HYPO_INVESTIGATION_SCREEN, {
    startMs: params?.startMs,
    endMs: params?.endMs,
    lowThreshold: params?.lowThreshold ?? 70,
  });
}

export function navigateToProductUpdateCenter(occurrenceId?: string) {
  if (!rootNavigationRef.isReady()) {
    return;
  }
  rootNavigationRef.navigate(PRODUCT_EXPERIENCE_SCREEN, {
    productIntent: createNativeProductNavigationIntent(
      CORE_DESTINATION_IDS.updateCenter,
      occurrenceId === undefined
        ? {}
        : {
            focus: {kind: 'alert-occurrence', occurrenceId},
          },
    ),
  });
}
