/**
 * Individual meal card for the Meal Timeline.
 *
 * Shows a single detected meal segment with:
 * - Time + label (e.g., "Lunch · 12:34")
 * - Carbs eaten, bolus given
 * - BG journey: before → peak → after with color-coded values
 * - Food item names (if available)
 */
import React from 'react';
import styled, {useTheme} from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CgmGraph from 'app/components/charts/CgmGraph/CgmGraph';

import type {ThemeType} from 'app/types/theme';
import type {MealSegment} from 'app/containers/MainTabsNavigator/Containers/Home/hooks/useMealSegments';
import {addOpacity} from 'app/style/styling.utils';
import TagChip from 'app/components/MealTagging/TagChip';

// ── Props ───────────────────────────────────────────────────────────────

type Props = {
  segment: MealSegment;
  isLatest: boolean;
  titleOverride?: string;
  /** Called when the user taps the tag button. */
  onTagPress?: (segment: MealSegment) => void;
};

// ── Helpers ─────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Uses shared CgmGraph renderer for meal mini-chart.

// ── Component ───────────────────────────────────────────────────────────

const MealTimelineCard: React.FC<Props> = ({segment, isLatest, titleOverride, onTagPress}) => {
  const theme = useTheme() as ThemeType;

  const bgBeforeColor = segment.bgBefore != null
    ? theme.determineBgColorByGlucoseValue(segment.bgBefore)
    : theme.borderColor;
  const bgPeakColor = segment.bgPeak != null
    ? theme.determineBgColorByGlucoseValue(segment.bgPeak)
    : theme.borderColor;
  const bgAfterColor = segment.bgAfter != null
    ? theme.determineBgColorByGlucoseValue(segment.bgAfter)
    : theme.borderColor;

  const rise =
    segment.bgBefore != null && segment.bgPeak != null
      ? segment.bgPeak - segment.bgBefore
      : null;

  const [graphWidth, setGraphWidth] = React.useState(0);
  const graphWindowMs = 2 * 60 * 60 * 1000;

  const lowPct = Math.max(0, Math.min(100, segment.postMealLowPct ?? 0));
  const inRangePct = Math.max(0, Math.min(100, segment.postMealTirPct ?? 0));
  const highPct = Math.max(0, Math.min(100, segment.postMealHighPct ?? 0));

  return (
    <CardWrap $isLatest={isLatest}>
      {/* Header row: label + time + tag button */}
      <HeaderRow>
        <LabelText>{titleOverride || segment.label}</LabelText>
        <HeaderRightRow>
          {onTagPress ? (
            <TagBtn
              onPress={() => onTagPress(segment)}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon
                name={segment.tags.length > 0 ? 'tag' : 'tag-plus-outline'}
                size={16}
                color={
                  segment.tags.length > 0
                    ? theme.accentColor
                    : addOpacity(theme.textColor, 0.35)
                }
              />
            </TagBtn>
          ) : null}
          <TimeText>{formatTime(segment.startMs)}</TimeText>
        </HeaderRightRow>
      </HeaderRow>

      {/* Metrics row */}
      <MetricsRow>
        {/* Carbs */}
        {segment.totalCarbs > 0 ? (
          <MetricChip>
            <Icon name="food-apple-outline" size={13} color={theme.colors.carbs} />
            <ChipText>{Math.round(segment.totalCarbs)}g</ChipText>
          </MetricChip>
        ) : null}

        {/* Bolus */}
        {segment.totalBolus > 0 ? (
          <MetricChip>
            <Icon name="needle" size={13} color={theme.colors.insulin} />
            <ChipText>{segment.totalBolus.toFixed(1)}u</ChipText>
            {segment.bolusCount > 1 ? (
              <ChipSubText>({segment.bolusCount}x)</ChipSubText>
            ) : null}
          </MetricChip>
        ) : null}

        {/* Rise info */}
        {rise != null ? (
          <MetricChip>
            <Icon
              name={rise > 0 ? 'arrow-up' : rise < 0 ? 'arrow-down' : 'minus'}
              size={13}
              color={rise > 50 ? theme.aboveRangeColor : rise < -30 ? theme.belowRangeColor : theme.inRangeColor}
            />
            <ChipText>{rise > 0 ? `+${rise}` : `${rise}`}</ChipText>
            {segment.timeToPeakMin != null ? (
              <ChipSubText>in {segment.timeToPeakMin}m</ChipSubText>
            ) : null}
          </MetricChip>
        ) : null}

        {/* Absorption */}
        {segment.absorptionPct != null ? (
          <MetricChip>
            <Icon
              name="stomach"
              size={13}
              color={
                segment.absorptionPct >= 80
                  ? theme.inRangeColor
                  : segment.absorptionPct >= 50
                    ? theme.aboveRangeColor
                    : theme.belowRangeColor
              }
            />
            <ChipText>
              {segment.absorbed}g/{Math.round(segment.totalCarbs)}g
            </ChipText>
            <ChipSubText>({segment.absorptionPct}%)</ChipSubText>
          </MetricChip>
        ) : null}
      </MetricsRow>

      {/* BG journey: before → peak → after */}
      {segment.bgBefore != null || segment.bgPeak != null || segment.bgAfter != null ? (
        <BgJourneyRow style={{direction: 'ltr'}}>
          <BgJourneyLabel>BG</BgJourneyLabel>
          <BgJourneyValue style={{color: bgBeforeColor}}>
            {segment.bgBefore ?? '—'}
          </BgJourneyValue>
          <BgArrowText>→</BgArrowText>
          <BgJourneyValue style={{color: bgPeakColor}}>
            {segment.bgPeak ?? '—'}
          </BgJourneyValue>
          <BgArrowText>→</BgArrowText>
          <BgJourneyValue style={{color: bgAfterColor}}>
            {segment.bgAfter ?? '—'}
          </BgJourneyValue>
        </BgJourneyRow>
      ) : null}

      <MiniGraphWrap
        onLayout={e => {
          const w = Math.max(0, Math.floor(e.nativeEvent.layout.width));
          if (w !== graphWidth) setGraphWidth(w);
        }}
      >
        {graphWidth > 0 && segment.postMealBgSamples.length ? (
          <>
            <CgmGraph
              bgSamples={segment.postMealBgSamples}
              foodItems={null}
              insulinData={segment.postMealBolusData}
              width={graphWidth}
              height={84}
              showDateLabels={false}
              showFullScreenButton={false}
              xDomain={[new Date(segment.startMs), new Date(segment.startMs + graphWindowMs)]}
            />
            {segment.postMealBolusData.length ? <MiniGraphHint>💉 bolus</MiniGraphHint> : null}
          </>
        ) : null}
      </MiniGraphWrap>

      {segment.postMealTirPct != null ? (
        <TirSection>
          <TirHeaderRow>
            <TirLabel>🟢 TIR (2h)</TirLabel>
            <TirValue>{segment.postMealTirPct}%</TirValue>
          </TirHeaderRow>
          <TirStackTrack>
            <TirLowFill $pct={lowPct} />
            <TirInRangeFill $pct={inRangePct} />
            <TirHighFill $pct={highPct} />
          </TirStackTrack>
          <TirLegendRow>
            <TirLegendText>🔴 {lowPct}%</TirLegendText>
            <TirLegendText>🟢 {inRangePct}%</TirLegendText>
            <TirLegendText>🟠 {highPct}%</TirLegendText>
          </TirLegendRow>
        </TirSection>
      ) : null}

      {/* Food names */}
      {segment.foodNames.length > 0 ? (
        <FoodRow>
          <FoodText numberOfLines={2}>{segment.foodNames.join(', ')}</FoodText>
        </FoodRow>
      ) : null}

      {/* Tags */}
      {segment.tags.length > 0 ? (
        <TagsDisplayRow>
          {segment.tags.map(tag => (
            <TagChip key={tag} tag={tag} compact />
          ))}
        </TagsDisplayRow>
      ) : null}
    </CardWrap>
  );
};

// ── Styled Components ───────────────────────────────────────────────────

const CardWrap = styled.View<{$isLatest: boolean; theme: ThemeType}>`
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md - 2}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius + 2}px;
  border-width: ${(p: {$isLatest: boolean}) => (p.$isLatest ? 1.5 : 1)}px;
  border-color: ${(p: {$isLatest: boolean; theme: ThemeType}) =>
    p.$isLatest ? addOpacity(p.theme.accentColor, 0.4) : addOpacity(p.theme.textColor, 0.1)};
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.white, 0.95)};
`;

const HeaderRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const HeaderRightRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const TagBtn = styled.TouchableOpacity`
  padding: 2px;
`;

const LabelText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const TimeText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
`;

const MetricsRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  flex-wrap: wrap;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm - 2}px;
  gap: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const MetricChip = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.xs - 1}px;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.05)};
`;

const ChipText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
  margin-left: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
`;

const ChipSubText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs - 1}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
  margin-left: ${(p: {theme: ThemeType}) => p.theme.spacing.xs - 1}px;
`;

const BgJourneyRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm - 2}px;
`;

const BgJourneyLabel = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
  margin-right: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const BgJourneyValue = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  font-weight: 800;
  writing-direction: ltr;
`;

const BgArrowText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.3)};
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.sm - 2}px;
`;

const TirSection = styled.View<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm - 2}px;
`;

const TirHeaderRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const TirLabel = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.65)};
`;

const TirValue = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 800;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const MiniGraphWrap = styled.View<{theme: ThemeType}>`
  width: 100%;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  align-items: stretch;
`;

const MiniGraphHint = styled.Text<{theme: ThemeType}>`
  margin-top: 1px;
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs - 2}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
`;

const TirStackTrack = styled.View<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.xs - 1}px;
  height: 9px;
  border-radius: 999px;
  overflow: hidden;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.1)};
  flex-direction: row;
`;

const TirLowFill = styled.View<{$pct: number; theme: ThemeType}>`
  width: ${(p: {$pct: number}) => Math.max(0, Math.min(100, p.$pct))}%;
  height: 9px;
  background-color: ${(p: {theme: ThemeType}) => p.theme.belowRangeColor};
`;

const TirInRangeFill = styled.View<{$pct: number; theme: ThemeType}>`
  width: ${(p: {$pct: number}) => Math.max(0, Math.min(100, p.$pct))}%;
  height: 9px;
  background-color: ${(p: {theme: ThemeType}) => p.theme.inRangeColor};
`;

const TirHighFill = styled.View<{$pct: number; theme: ThemeType}>`
  width: ${(p: {$pct: number}) => Math.max(0, Math.min(100, p.$pct))}%;
  height: 9px;
  background-color: ${(p: {theme: ThemeType}) => p.theme.aboveRangeColor};
`;

const TirLegendRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-top: 4px;
`;

const TirLegendText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs - 1}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.65)};
`;

const FoodRow = styled.View<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
`;

const FoodText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs - 1}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.45)};
  font-style: italic;
`;

const TagsDisplayRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
`;

export default React.memo(MealTimelineCard);
