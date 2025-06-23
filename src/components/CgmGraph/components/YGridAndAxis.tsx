import { G } from "react-native-svg";
import React, { useContext } from "react";
import { GraphStyleContext } from "app/components/CgmGraph/contextStores/GraphStyleContext";
import { GlucoseGrid } from "app/components/shared/GlucoseChart";

interface Props {
  highestBgThreshold: number;
}

const YGridAndAxis = ({
  highestBgThreshold, // max y value
}: Props) => {
  const [{ graphWidth, graphHeight }] = useContext(GraphStyleContext);
  
  // Create Y scale function that maps glucose values to pixel positions
  const yScale = (glucoseValue: number): number => {
    // Linear scale from glucose range to pixel range (inverted)
    const ratio = (highestBgThreshold - glucoseValue) / highestBgThreshold;
    return ratio * graphHeight;
  };
  return (
    <GlucoseGrid
      width={graphWidth}
      height={graphHeight}
      yScale={yScale}
      showLabels={true}
      showMinorGrid={true}
      labelOffset={-10}
    />
  );
};export default YGridAndAxis;
