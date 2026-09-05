import {type ContextType, useMemo} from 'react';
import {findClosestBgSample} from 'app/components/charts/CgmGraph/utils';
import {GraphStyleContext} from '../contextStores/GraphStyleContext';
import {useTouchContext} from 'app/components/charts/CgmGraph/contextStores/TouchContext';

type GraphStyleState = ContextType<typeof GraphStyleContext>[0];

export const useClosestBgSample = ({
  graphStyleContextState,
}: {
  readonly graphStyleContextState: GraphStyleState;
}) => {
  const {bgSamples, margin, xScale} = graphStyleContextState;
  const {isTouchActive, touchPosition} = useTouchContext();

  const closestBgSample = useMemo(() => {
    if (!isTouchActive || !bgSamples.length) {
      return null;
    }

    // Adjust touchPosition to account for graph margins
    const adjustedTouchPosition = touchPosition.x - margin.left;

    // Convert touch position to the corresponding domain value
    const touchTime = xScale.invert(adjustedTouchPosition);
    return findClosestBgSample(touchTime.getTime(), bgSamples);
  }, [isTouchActive, touchPosition, bgSamples, margin.left, xScale]);

  return closestBgSample;
};
