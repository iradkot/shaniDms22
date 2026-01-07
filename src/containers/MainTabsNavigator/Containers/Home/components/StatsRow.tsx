import React, {useEffect, useRef} from 'react';
import styled, {useTheme} from 'styled-components/native';
import {Text, View} from 'react-native';
import {BgSample} from 'app/types/day_bgs.types';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {
  calculateAverageAndStdDev,
  findBiggestChangesInTimeRange,
} from 'app/utils/bg.utils';
import {Theme} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const Section = styled.View<{theme: Theme}>`
  padding: 6px 10px;
`;

const CardRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
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
  color: ${({theme}) => addOpacity(theme.black, 0.75)};
`;

const CardValue = styled.Text<{theme: Theme; color?: string}>`
  margin-top: 6px;
  font-size: 18px;
  font-weight: 800;
  color: ${({theme, color}) => color ?? theme.black};
`;

const CardSubtle = styled.Text<{theme: Theme}>`
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: ${({theme}) => addOpacity(theme.black, 0.65)};
`;

const InlineRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
`;

interface StatsRowProps {
  bgData: BgSample[];
  averageTitleTestID?: string;
}

export const StatsRow: React.FC<StatsRowProps> = ({bgData, averageTitleTestID}) => {
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

  const didLogRef = useRef(false);
  useEffect(() => {
    if (!__DEV__) return;
    if (didLogRef.current) return;
    didLogRef.current = true;

    console.log('[BG Stats] render', {
      count: data.length,
      averageBg,
      stdDev,
      lowest: {sgv: lowestBg?.sgv, date: lowestBg?.date},
      highest: {sgv: highestBg?.sgv, date: highestBg?.date},
      upChange,
      downChange,
      colors: {
        avgColor,
        lowColor,
        highColor,
        themeBlack: (theme as any)?.black,
        themeWhite: (theme as any)?.white,
        themeText: (theme as any)?.textColor,
      },
    });
  }, [
    data.length,
    averageBg,
    stdDev,
    lowestBg,
    highestBg,
    upChange,
    downChange,
    avgColor,
    lowColor,
    highColor,
    theme,
  ]);

  return (
    <>
      <Section>
        <CardRow>
          <View
            style={{
              flex: 1,
              marginRight: 8,
            }}>
            <CardSurface testID={averageTitleTestID} collapsable={false}>
              <CardTitle>Average</CardTitle>
              <CardValue color={avgColor}>{averageBg}</CardValue>
              <CardSubtle>
                SD: {stdDev.toFixed(1)}
              </CardSubtle>
            </CardSurface>
          </View>

          <View
            style={{
              flex: 1,
              marginRight: 8,
            }}>
            <CardSurface>
              <CardTitle>Lowest</CardTitle>
              <CardValue color={lowColor}>{lowestBg.sgv}</CardValue>
              <CardSubtle>{formatDateToLocaleTimeString(lowestBg.date)}</CardSubtle>
            </CardSurface>
          </View>

          <View
            style={{
              flex: 1,
            }}>
            <CardSurface>
              <CardTitle>Highest</CardTitle>
              <CardValue color={highColor}>{highestBg.sgv}</CardValue>
              <CardSubtle>{formatDateToLocaleTimeString(highestBg.date)}</CardSubtle>
            </CardSurface>
          </View>
        </CardRow>

        <CardRow>
          <View
            style={{
              flex: 1,
              marginRight: 8,
            }}>
            <CardSurface>
              <CardTitle>Biggest Rise</CardTitle>
              <InlineRow>
                <CardValue>{upChange.fromValue}</CardValue>
                <Text style={{fontSize: 18, color: addOpacity(theme.black, 0.6)}}>
                  {'\u2191'}
                </Text>
                <CardValue>{upChange.toValue}</CardValue>
              </InlineRow>
              <CardSubtle>
                {formatDateToLocaleTimeString(upChange.fromTime)} - {formatDateToLocaleTimeString(upChange.toTime)}
              </CardSubtle>
            </CardSurface>
          </View>

          <View
            style={{
              flex: 1,
            }}>
            <CardSurface>
              <CardTitle>Biggest Fall</CardTitle>
              <InlineRow>
                <CardValue>{downChange.fromValue}</CardValue>
                <Text style={{fontSize: 18, color: addOpacity(theme.black, 0.6)}}>
                  {'\u2193'}
                </Text>
                <CardValue>{downChange.toValue}</CardValue>
              </InlineRow>
              <CardSubtle>
                {formatDateToLocaleTimeString(downChange.fromTime)} - {formatDateToLocaleTimeString(downChange.toTime)}
              </CardSubtle>
            </CardSurface>
          </View>
        </CardRow>
      </Section>
    </>
  );
};

export default StatsRow;
