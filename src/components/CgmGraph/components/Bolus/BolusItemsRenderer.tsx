import React, {useContext, useMemo, useState} from 'react';
import {Circle, G} from 'react-native-svg';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {InsulinDataEntry} from 'app/types/insulin.types';
import {GraphStyleContext} from 'app/components/CgmGraph/contextStores/GraphStyleContext';
import BolusTooltip from './BolusTooltip';

type Props = {
  insulinData: InsulinDataEntry[] | undefined;
};

const BolusItemsRenderer: React.FC<Props> = ({insulinData}) => {
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

  const [focusedBolusId, setFocusedBolusId] = useState<string | null>(null);

  if (!boluses.length) {
    return null;
  }

  return (
    <>
      {boluses.map(bolus => {
        const x = xScale(bolus.timestamp);
        const y = yScale(260);
        const isFocused = focusedBolusId === bolus.id;

        return (
          <G key={bolus.id}>
            <Circle
              cx={x}
              cy={y}
              r={isFocused ? 6 : 4}
              fill={theme.accentColor}
              stroke={theme.white}
              strokeWidth={1}
              onPress={() => setFocusedBolusId(prev => (prev === bolus.id ? null : bolus.id))}
            />
            {isFocused && (
              <BolusTooltip x={x} y={y} timestamp={bolus.timestamp} amount={bolus.amount} />
            )}
          </G>
        );
      })}
    </>
  );
};

export default BolusItemsRenderer;
