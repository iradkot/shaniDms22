import React from 'react';
import styled, {useTheme} from 'styled-components/native';
import {Pressable, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {BgSample} from 'app/types/day_bgs.types';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {
  calculateAverageAndStdDev,
  findBiggestChangesInTimeRange,
} from 'app/utils/bg.utils';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const BG_CHANGE_TIME_RANGE_MINUTES = 30;
const CARD_GAP = 8;
const INLINE_ICON_FONT_SIZE = 18;
const INLINE_ICON_MARGIN_HORIZONTAL = 6;

type ThemedProps = {theme: ThemeType};

const Section = styled.View.attrs({collapsable: false})<{theme: ThemeType}>`
  padding-top: 6px;
  padding-right: 10px;
  padding-bottom: 6px;
  padding-left: 10px;
`;

const CardRow = styled.View.attrs({collapsable: false})`
  flex-direction: row;
  justify-content: flex-start;
  margin-bottom: 8px;
`;

const CardSurface = styled.View.attrs({collapsable: false})<{theme: ThemeType}>`
  background-color: ${(props: ThemedProps) => props.theme.white};
  border-radius: 12px;
  padding: 12px;
  width: 100%;
`;

const PressableCardSurface = styled(Pressable).attrs({collapsable: false})<{
  active?: boolean;
  theme: ThemeType;
}>`
  background-color: ${(props: ThemedProps) => props.theme.white};
  border-radius: 12px;
  padding: 12px;
  width: 100%;
  border-width: ${(props: {active?: boolean}) => (props.active ? 1 : 0)}px;
  border-color: ${(props: {active?: boolean; theme: ThemeType}) =>
    props.active
      ? addOpacity(props.theme.accentColor, 0.45)
      : 'transparent'};
`;

const TitleRow = styled.View.attrs({collapsable: false})`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const CardTitle = styled.Text<{theme: ThemeType}>`
  font-size: 12px;
  font-weight: 700;
  color: ${(props: ThemedProps) => addOpacity(props.theme.black, 0.75)};
`;

const CardValue = styled.Text<{theme: ThemeType; color?: string}>`
  margin-top: 6px;
  font-size: 18px;
  font-weight: 800;
  color: ${(props: {theme: ThemeType; color?: string}) =>
    props.color ?? props.theme.black};
`;

const CardSubtle = styled.Text<{theme: ThemeType}>`
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: ${(props: ThemedProps) => addOpacity(props.theme.black, 0.65)};
`;

const InlineRow = styled.View.attrs({collapsable: false})`
  flex-direction: row;
  align-items: center;
  justify-content: center;
`;

export type BgStatsKey = 'lowest' | 'highest' | 'biggestRise' | 'biggestFall';

export type BgStatsNavigatePayload = {
  key: BgStatsKey;
  targetDateMs: number;
  highlightDateMs: number[];
};

interface StatsRowProps {
  bgData: BgSample[];
  averageTitleTestID?: string;
  activeKey?: BgStatsKey | null;
  onNavigateToSample?: (payload: BgStatsNavigatePayload) => void;
}

export const StatsRow: React.FC<StatsRowProps> = ({
  bgData,
  averageTitleTestID,
  activeKey,
  onNavigateToSample,
}) => {
  const theme = useTheme() as ThemeType;
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
  const bgChangeTimeRange = BG_CHANGE_TIME_RANGE_MINUTES;
  const {upChange, downChange} = findBiggestChangesInTimeRange(
    data,
    bgChangeTimeRange,
  );

  const avgColor = theme.determineBgColorByGlucoseValue(averageBg);
  const lowColor = theme.determineBgColorByGlucoseValue(lowestBg.sgv);
  const highColor = theme.determineBgColorByGlucoseValue(highestBg.sgv);

  const canNavigate = !!onNavigateToSample;

  const renderPressableChevron = (enabled: boolean) => {
    if (!enabled) return null;
    return (
      <Icon
        name="chevron-right"
        size={18}
        color={addOpacity(theme.textColor, 0.45)}
      />
    );
  };

  return (
    <>
      <Section>
        <CardRow>
          <View
            collapsable={false}
            style={{
              flex: 1,
              marginRight: CARD_GAP,
            }}>
            <CardSurface testID={averageTitleTestID} collapsable={false}>
              <CardTitle>Average</CardTitle>
              <CardValue color={avgColor}>
                {averageBg}
              </CardValue>
              <CardSubtle>SD: {stdDev.toFixed(1)}</CardSubtle>
            </CardSurface>
          </View>

          <View
            collapsable={false}
            style={{
              flex: 1,
              marginRight: CARD_GAP,
            }}>
            <PressableCardSurface
              active={activeKey === 'lowest'}
              disabled={!canNavigate}
              accessibilityRole={canNavigate ? 'button' : undefined}
              accessibilityLabel={canNavigate ? 'Lowest BG' : undefined}
              accessibilityHint={canNavigate ? 'Scroll to this reading' : undefined}
              onPress={() =>
                onNavigateToSample?.({
                  key: 'lowest',
                  targetDateMs: lowestBg.date,
                  highlightDateMs: [lowestBg.date],
                })
              }>
              <TitleRow>
                <CardTitle>Lowest</CardTitle>
                {renderPressableChevron(canNavigate)}
              </TitleRow>
              <CardValue color={lowColor}>{lowestBg.sgv}</CardValue>
              <CardSubtle>{formatDateToLocaleTimeString(lowestBg.date)}</CardSubtle>
            </PressableCardSurface>
          </View>

          <View
            collapsable={false}
            style={{
              flex: 1,
            }}>
            <PressableCardSurface
              active={activeKey === 'highest'}
              disabled={!canNavigate}
              accessibilityRole={canNavigate ? 'button' : undefined}
              accessibilityLabel={canNavigate ? 'Highest BG' : undefined}
              accessibilityHint={canNavigate ? 'Scroll to this reading' : undefined}
              onPress={() =>
                onNavigateToSample?.({
                  key: 'highest',
                  targetDateMs: highestBg.date,
                  highlightDateMs: [highestBg.date],
                })
              }>
              <TitleRow>
                <CardTitle>Highest</CardTitle>
                {renderPressableChevron(canNavigate)}
              </TitleRow>
              <CardValue color={highColor}>{highestBg.sgv}</CardValue>
              <CardSubtle>{formatDateToLocaleTimeString(highestBg.date)}</CardSubtle>
            </PressableCardSurface>
          </View>
        </CardRow>

        <CardRow>
          <View
            collapsable={false}
            style={{
              flex: 1,
              marginRight: CARD_GAP,
            }}>
            <PressableCardSurface
              active={activeKey === 'biggestRise'}
              disabled={!canNavigate}
              accessibilityRole={canNavigate ? 'button' : undefined}
              accessibilityLabel={canNavigate ? 'Biggest rise' : undefined}
              accessibilityHint={canNavigate ? 'Scroll to these readings' : undefined}
              onPress={() =>
                onNavigateToSample?.({
                  key: 'biggestRise',
                  targetDateMs: upChange.toTimeMs,
                  highlightDateMs: [upChange.fromTimeMs, upChange.toTimeMs].filter(
                    Boolean,
                  ),
                })
              }>
              <TitleRow>
                <CardTitle>Biggest Rise</CardTitle>
                {renderPressableChevron(canNavigate)}
              </TitleRow>
              <InlineRow>
                <CardValue>{upChange.fromValue}</CardValue>
                <Text
                  style={{
                    fontSize: INLINE_ICON_FONT_SIZE,
                    color: addOpacity(theme.black, 0.6),
                    marginHorizontal: INLINE_ICON_MARGIN_HORIZONTAL,
                  }}>
                  {'\u2191'}
                </Text>
                <CardValue>{upChange.toValue}</CardValue>
              </InlineRow>
              <CardSubtle>
                {formatDateToLocaleTimeString(upChange.fromTimeMs)} - {formatDateToLocaleTimeString(upChange.toTimeMs)}
              </CardSubtle>
            </PressableCardSurface>
          </View>

          <View
            collapsable={false}
            style={{
              flex: 1,
            }}>
            <PressableCardSurface
              active={activeKey === 'biggestFall'}
              disabled={!canNavigate}
              accessibilityRole={canNavigate ? 'button' : undefined}
              accessibilityLabel={canNavigate ? 'Biggest fall' : undefined}
              accessibilityHint={canNavigate ? 'Scroll to these readings' : undefined}
              onPress={() =>
                onNavigateToSample?.({
                  key: 'biggestFall',
                  targetDateMs: downChange.toTimeMs,
                  highlightDateMs: [downChange.fromTimeMs, downChange.toTimeMs].filter(
                    Boolean,
                  ),
                })
              }>
              <TitleRow>
                <CardTitle>Biggest Fall</CardTitle>
                {renderPressableChevron(canNavigate)}
              </TitleRow>
              <InlineRow>
                <CardValue>{downChange.fromValue}</CardValue>
                <Text
                  style={{
                    fontSize: INLINE_ICON_FONT_SIZE,
                    color: addOpacity(theme.black, 0.6),
                    marginHorizontal: INLINE_ICON_MARGIN_HORIZONTAL,
                  }}>
                  {'\u2193'}
                </Text>
                <CardValue>{downChange.toValue}</CardValue>
              </InlineRow>
              <CardSubtle>
                {formatDateToLocaleTimeString(downChange.fromTimeMs)} - {formatDateToLocaleTimeString(downChange.toTimeMs)}
              </CardSubtle>
            </PressableCardSurface>
          </View>
        </CardRow>
      </Section>
    </>
  );
};

export default StatsRow;
