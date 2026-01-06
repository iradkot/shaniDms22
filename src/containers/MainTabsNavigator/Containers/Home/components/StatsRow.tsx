import React from 'react';
import styled, {useTheme} from 'styled-components/native';
import {Text, View} from 'react-native';
import {BgSample} from 'app/types/day_bgs.types';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {
  calculateAverageAndStdDev,
  findBiggestChangesInTimeRange,
} from 'app/utils/bg.utils';
import {Theme} from 'app/types/theme';
import DropShadow from 'react-native-drop-shadow';
import {addOpacity} from 'app/style/styling.utils';

const Section = styled.View<{theme: Theme}>`
  padding: 6px 10px;
`;

const CardRow = styled.View`
  flex-direction: row;
  gap: 8px;
  margin-bottom: 8px;
`;

const CardSurface = styled.View<{theme: Theme}>`
  flex: 1;
  background-color: ${({theme}) => theme.white};
  border-radius: 12px;
  padding: 12px;
`;

const CardTitle = styled.Text<{theme: Theme}>`
  font-size: 12px;
  font-weight: 700;
  color: ${({theme}) => addOpacity(theme.textColor, 0.75)};
`;

const CardValue = styled.Text<{theme: Theme; color?: string}>`
  margin-top: 6px;
  font-size: 18px;
  font-weight: 800;
  color: ${({theme, color}) => color ?? theme.textColor};
`;

const CardSubtle = styled.Text<{theme: Theme}>`
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: ${({theme}) => addOpacity(theme.textColor, 0.65)};
`;

const InlineRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
`;

interface StatsRowProps {
  bgData: BgSample[];
}

export const StatsRow: React.FC<StatsRowProps> = ({bgData}) => {
  const theme = useTheme() as Theme;
  const data = bgData ?? [];
  if (data.length === 0) return null;

  // Calculate the statistics from the bgData array
  const {averageBg, stdDev} = calculateAverageAndStdDev(data);
  const {lowestBg, highestBg} = data.reduce(
    (acc, bg) => {
      if (bg.sgv <= acc.lowestBg.sgv) {
        acc.lowestBg = bg;
      }
      if (bg.sgv >= acc.highestBg.sgv) {
        acc.highestBg = bg;
      }
      return acc;
    },
    {lowestBg: data[0], highestBg: data[0]},
  );
  const bgChangeTimeRange = 30;
  const {upChange, downChange} = findBiggestChangesInTimeRange(
    data,
    bgChangeTimeRange,
  );

  const avgColor = theme.determineBgColorByGlucoseValue(averageBg);
  const lowColor = theme.determineBgColorByGlucoseValue(lowestBg.sgv);
  const highColor = theme.determineBgColorByGlucoseValue(highestBg.sgv);

  return (
    <>
      <Section>
        <CardRow>
          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: 0.08,
              shadowRadius: 3,
              elevation: 2,
              flex: 1,
            }}>
            <CardSurface>
              <CardTitle>Average</CardTitle>
              <CardValue color={avgColor}>{averageBg}</CardValue>
              <CardSubtle>
                SD: {stdDev.toFixed(1)}
              </CardSubtle>
            </CardSurface>
          </DropShadow>

          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: 0.08,
              shadowRadius: 3,
              elevation: 2,
              flex: 1,
            }}>
            <CardSurface>
              <CardTitle>Lowest</CardTitle>
              <CardValue color={lowColor}>{lowestBg.sgv}</CardValue>
              <CardSubtle>{formatDateToLocaleTimeString(lowestBg.date)}</CardSubtle>
            </CardSurface>
          </DropShadow>

          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: 0.08,
              shadowRadius: 3,
              elevation: 2,
              flex: 1,
            }}>
            <CardSurface>
              <CardTitle>Highest</CardTitle>
              <CardValue color={highColor}>{highestBg.sgv}</CardValue>
              <CardSubtle>{formatDateToLocaleTimeString(highestBg.date)}</CardSubtle>
            </CardSurface>
          </DropShadow>
        </CardRow>

        <CardRow>
          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: 0.08,
              shadowRadius: 3,
              elevation: 2,
              flex: 1,
            }}>
            <CardSurface>
              <CardTitle>Biggest Rise</CardTitle>
              <InlineRow>
                <CardValue>{upChange.fromValue}</CardValue>
                <Text style={{fontSize: 18, color: addOpacity(theme.textColor, 0.6)}}>
                  {'\u2191'}
                </Text>
                <CardValue>{upChange.toValue}</CardValue>
              </InlineRow>
              <CardSubtle>
                {formatDateToLocaleTimeString(upChange.fromTime)} - {formatDateToLocaleTimeString(upChange.toTime)}
              </CardSubtle>
            </CardSurface>
          </DropShadow>

          <DropShadow
            style={{
              shadowColor: '#000',
              shadowOffset: {width: 0, height: 2},
              shadowOpacity: 0.08,
              shadowRadius: 3,
              elevation: 2,
              flex: 1,
            }}>
            <CardSurface>
              <CardTitle>Biggest Fall</CardTitle>
              <InlineRow>
                <CardValue>{downChange.fromValue}</CardValue>
                <Text style={{fontSize: 18, color: addOpacity(theme.textColor, 0.6)}}>
                  {'\u2193'}
                </Text>
                <CardValue>{downChange.toValue}</CardValue>
              </InlineRow>
              <CardSubtle>
                {formatDateToLocaleTimeString(downChange.fromTime)} - {formatDateToLocaleTimeString(downChange.toTime)}
              </CardSubtle>
            </CardSurface>
          </DropShadow>
        </CardRow>
      </Section>
    </>
  );
};

export default StatsRow;
