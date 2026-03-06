import {createNavigationContainerRef} from '@react-navigation/native';

import {HYPO_INVESTIGATION_SCREEN} from 'app/constants/SCREEN_NAMES';

export const rootNavigationRef = createNavigationContainerRef<any>();

type HypoInvestigationParams = {
  startMs?: number;
  endMs?: number;
  lowThreshold?: number;
};

export function navigateToHypoInvestigation(params?: HypoInvestigationParams) {
  if (!rootNavigationRef.isReady()) return;

  rootNavigationRef.navigate(HYPO_INVESTIGATION_SCREEN, {
    startMs: params?.startMs,
    endMs: params?.endMs,
    lowThreshold: params?.lowThreshold ?? 70,
  });
}
