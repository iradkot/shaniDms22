import React, {useContext, useMemo} from 'react';
import {Circle, G} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {InsulinDataEntry} from 'app/types/insulin.types';
import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import {colors} from 'app/style/colors';
import {getBolusMarkerYValue} from 'app/components/charts/CgmGraph/utils/bolusUtils';

type Props = {
  insulinData: InsulinDataEntry[] | undefined;
  focusedBolusTimestamps?: string[];
};

const BolusItemsRenderer: React.FC<Props> = ({insulinData, focusedBolusTimestamps}) => {
  const theme = useTheme() as ThemeType;
  const [{xScale, yScale}] = useContext(GraphStyleContext);

  const boluses = useMemo(() => {
    if (!insulinData?.length) {
      return [];
    }

    return insulinData
      .filter(entry => entry.type === 'bolus' && !!entry.timestamp && typeof entry.amount === 'number')
      .map(entry => ({
        id: `${entry.timestamp}-${entry.amount ?? 0}`,
        timestamp: new Date(entry.timestamp as string),
        amount: entry.amount as number,
      }))
      .filter(entry => !Number.isNaN(entry.timestamp.getTime()));
  }, [insulinData]);

  if (!boluses.length) {
    return null;
  }

  return (
    <>
      {boluses.map(bolus => {
        const x = xScale(bolus.timestamp);
        const y = yScale(getBolusMarkerYValue());
        const baseRadius = 3;
        const scaledRadius = Math.max(3, Math.min(7, baseRadius + bolus.amount * 0.3));
        const fill = colors.orange[500];
        const isFocused = Boolean(
          focusedBolusTimestamps?.some(ts => ts === bolus.timestamp.toISOString()),
        );
        return (
          <G key={bolus.id}>
            <Circle
              cx={x}
              cy={y}
              r={scaledRadius}
              fill={fill}
              stroke={theme.white}
              strokeWidth={1}
              transform={`rotate(45 ${x} ${y})`}
            />
            {isFocused && (
              <Circle
                cx={x}
                cy={y}
                r={scaledRadius + 2}
                fill="none"
                stroke={fill}
                strokeWidth={1}
                strokeDasharray="2,2"
                transform={`rotate(45 ${x} ${y})`}
              />
            )}
          </G>
        );
      })}
    </>
  );
};

export default BolusItemsRenderer;
