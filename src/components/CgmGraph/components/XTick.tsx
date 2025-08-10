import styled from "styled-components/native";
import { G, Line, Text } from "react-native-svg";
import subMinutes from "date-fns/subMinutes";
import { formatDateToLocaleTimeString } from "app/utils/datetime.utils";
import React, { useContext } from "react";
import { GraphStyleContext } from "../contextStores/GraphStyleContext";
import { CHART_COLORS, CHART_OPACITY } from "app/components/shared/GlucoseChart";

interface TickProps {
  x: number;
  withDate?: boolean;
  lineStyle?: any;
  textStyle?: any;
  roundTicks?: boolean;
}

const StyledLine = styled(Line)`
  stroke: ${CHART_COLORS.gridMinor};
  opacity: ${CHART_OPACITY.medium};
  strokeWidth: 0.5;
`;
const StyledText = styled(Text)`
  fill: ${CHART_COLORS.textSecondary};
  opacity: ${CHART_OPACITY.strong};
  fontFamily: 'Arial, sans-serif';
`;

const XTick = ({ x, withDate, lineStyle, textStyle, roundTicks }: TickProps) => {
  const [{ xScale, graphHeight }] = useContext(GraphStyleContext);
  const dateTick = xScale.invert(x);
  const roundHourOffset = new Date(dateTick).getMinutes() % 60;
  const roundHourDate = new Date(subMinutes(dateTick, roundHourOffset));
  const tickX = xScale(roundTicks ? roundHourDate : (dateTick as any));

  return (
    <G>
      <StyledLine
        x1={tickX}
        y1={0}
        x2={tickX}
        y2={graphHeight}
        {...lineStyle}
      />
      {withDate && (        
        <StyledText
          x={tickX}
          y={graphHeight + 15}
          fontSize={11}
          textAnchor="middle"
          {...textStyle}>
          {formatDateToLocaleTimeString(roundHourDate)}
        </StyledText>
      )}
    </G>
  );
};

export default XTick;
