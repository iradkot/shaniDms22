import React, {useCallback, useMemo, useState} from 'react';
import {Pressable} from 'react-native';
import styled, {useTheme} from 'styled-components/native';
import DropShadow from 'react-native-drop-shadow';
import {formatDistanceToNow} from 'date-fns';

import BgGradient from 'app/components/BgGradient';
import DirectionArrows from 'app/components/DirectionArrows';
import LoadBars from 'app/components/LoadBars/LoadBars';
import {ThemeType} from 'app/types/theme';
import {BgSample} from 'app/types/day_bgs.types';
import {LOAD_BARS_CONSTANTS} from 'app/utils/loadBars.utils';
import {
  useLatestNightscoutSnapshot,
} from 'app/hooks/useLatestNightscoutSnapshot';
import {isE2E} from 'app/utils/e2e';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

const CONSTANTS = {
  minDeltaForGlow: 10,
} as const;

function formatDelta(params: {
  current: BgSample;
  previous?: BgSample;
}): string {
  const {current, previous} = params;
  if (!previous) return '';

  const diff = current.sgv - previous.sgv;
  if (!Number.isFinite(diff)) return '';
  if (diff === 0) return '0';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function shouldUsePreviousSample(params: {
  current: BgSample;
  previous?: BgSample;
}): boolean {
  const {current, previous} = params;
  if (!previous) return false;
  // Only compute delta if the previous sample is plausibly adjacent.
  return current.date > previous.date && current.date - previous.date <= 10 * 60 * 1000;
}

/**
 * Smart expandable header that shows the latest BG plus Loop-derived context.
 *
 * Behavior (PRD):
 * - Collapsed: poll Nightscout latest endpoints every 60s
 * - Expanded: pause polling (to avoid UI jumping while reading)
 * - Stale rules: 10m dims prediction text; 15m hides predictions
 */
const SmartExpandableHeader: React.FC<{
  /**
   * Latest BG sample from the day list, used as an E2E fallback when the
   * Nightscout "latest" endpoints are empty/unavailable.
   */
  fallbackLatestBgSample?: BgSample;
  /** Used only to compute a delta string when available. */
  latestPrevBgSample?: BgSample;
  /** Scaling references for IOB/COB bars. */
  maxIobReference: number;
  maxCobReference: number;
}> = ({fallbackLatestBgSample, latestPrevBgSample, maxIobReference, maxCobReference}) => {
  const theme = useTheme() as ThemeType;
  const [expanded, setExpanded] = useState(false);

  const {snapshot} = useLatestNightscoutSnapshot({pollingEnabled: !expanded});

  const usingE2EFallback = useMemo(() => {
    return Boolean(isE2E && !snapshot && fallbackLatestBgSample);
  }, [fallbackLatestBgSample, snapshot]);

  const onToggleExpanded = useCallback(() => {
    setExpanded(v => !v);
  }, []);

  const effectiveSnapshot = useMemo(() => {
    if (snapshot) return snapshot;

    // Maestro/E2E: keep Home header deterministic even if the backing
    // Nightscout environment has no recent entries.
    if (isE2E && fallbackLatestBgSample) {
      const nowMs = Date.now();
      return {
        bg: fallbackLatestBgSample,
        deviceStatus: null,
        enrichedBg: fallbackLatestBgSample,
        predictions: [
          {ts: nowMs + 5 * 60 * 1000, sgv: fallbackLatestBgSample.sgv + 5},
          {ts: nowMs + 10 * 60 * 1000, sgv: fallbackLatestBgSample.sgv + 10},
          {ts: nowMs + 15 * 60 * 1000, sgv: fallbackLatestBgSample.sgv + 15},
        ],
        staleLevel: 'fresh' as const,
      };
    }

    return null;
  }, [fallbackLatestBgSample, snapshot]);

  const model = useMemo(() => {
    if (!effectiveSnapshot) return null;

    const startColor = theme.white;
    const endColor = theme.determineBgColorByGlucoseValue(
      effectiveSnapshot.enrichedBg.sgv,
    );

    const canUsePrev = shouldUsePreviousSample({
      current: effectiveSnapshot.bg,
      previous: latestPrevBgSample,
    });

    const delta = canUsePrev
      ? formatDelta({current: effectiveSnapshot.bg, previous: latestPrevBgSample})
      : '';

    const deltaAbs = canUsePrev
      ? Math.abs(effectiveSnapshot.bg.sgv - (latestPrevBgSample?.sgv ?? 0))
      : 0;

    const showDimmedPredictions = effectiveSnapshot.staleLevel === 'stale';

    return {
      ...effectiveSnapshot,
      startColor,
      endColor,
      delta,
      deltaAbs,
      showDimmedPredictions,
    };
  }, [effectiveSnapshot, latestPrevBgSample, theme]);

  if (!model) {
    return null;
  }

  const glowShadow = model.deltaAbs >= CONSTANTS.minDeltaForGlow;

  const dropShadowStyle = {
    shadowColor: theme.shadowColor,
    shadowOffset: {width: 1, height: 1},
    shadowOpacity: glowShadow ? 0.75 : 0.5,
    shadowRadius: glowShadow ? 3 : 2,
  };

  const timeLabel = `${formatDistanceToNow(new Date(model.bg.date))} ago`;

  return (
    <Container>
      {isE2E ? (
        <E2EHidden>
          {snapshot ? (
            <E2EHidden testID={E2E_TEST_IDS.homeHeader.sourceNightscout} />
          ) : usingE2EFallback ? (
            <E2EHidden testID={E2E_TEST_IDS.homeHeader.sourceFallback} />
          ) : null}
        </E2EHidden>
      ) : null}

      <Pressable
        testID={E2E_TEST_IDS.homeHeader.toggle}
        onPress={onToggleExpanded}>
        <BgGradient startColor={model.startColor} endColor={model.endColor} style={gradientStyle(theme)}>
          <TimeBgSection>
            <Row>
              <DropShadow style={dropShadowStyle}>
                <BgValueText>{model.bg.sgv}</BgValueText>
              </DropShadow>
              <DirectionArrows trendDirection={model.bg.direction} />
            </Row>
            <TimeText numberOfLines={1}>{timeLabel}</TimeText>
          </TimeBgSection>

          <DeltaSection>
            <DeltaText numberOfLines={1}>{model.delta}</DeltaText>
          </DeltaSection>

          <RightSection>
            {expanded ? (
              <LoadBars
                iobTotal={model.enrichedBg.iob}
                iobBolus={model.enrichedBg.iobBolus}
                iobBasal={model.enrichedBg.iobBasal}
                cob={model.enrichedBg.cob}
                maxIobReference={maxIobReference}
                maxCobReference={maxCobReference}
              />
            ) : (
              <PredictionRow testID={E2E_TEST_IDS.homeHeader.predictionsRow}>
                {model.predictions.length ? (
                  <PredictionLabel
                    testID={E2E_TEST_IDS.homeHeader.predictionLabel}
                    $dim={model.showDimmedPredictions}
                    numberOfLines={1}>
                    Next
                  </PredictionLabel>
                ) : null}
                {model.predictions.map((p, idx) => (
                  <PredictionItem key={p.ts}>
                    <PredictionArrow
                      $dim={model.showDimmedPredictions}
                      numberOfLines={1}>
                      →
                    </PredictionArrow>
                    <PredictionText
                      testID={
                        idx === 0
                          ? E2E_TEST_IDS.homeHeader.predictionValue0
                          : idx === 1
                            ? E2E_TEST_IDS.homeHeader.predictionValue1
                            : E2E_TEST_IDS.homeHeader.predictionValue2
                      }
                      $dim={model.showDimmedPredictions}
                      numberOfLines={1}>
                      {p.sgv}
                    </PredictionText>
                  </PredictionItem>
                ))}
              </PredictionRow>
            )}
          </RightSection>
        </BgGradient>
      </Pressable>

      {/* Keep layout stable: when expanded, show predictions on a second line (if any). */}
      {expanded && model.predictions.length ? (
        <ExpandedPredictionWrap>
          <PredictionRow testID={E2E_TEST_IDS.homeHeader.predictionsRow}>
            <PredictionLabel
              testID={E2E_TEST_IDS.homeHeader.predictionLabel}
              $dim={model.showDimmedPredictions}
              numberOfLines={1}>
              Next
            </PredictionLabel>
            {model.predictions.map((p, idx) => (
              <PredictionItem key={p.ts}>
                <PredictionArrow $dim={model.showDimmedPredictions} numberOfLines={1}>
                  →
                </PredictionArrow>
                <PredictionText
                  testID={
                    idx === 0
                      ? E2E_TEST_IDS.homeHeader.predictionValue0
                      : idx === 1
                        ? E2E_TEST_IDS.homeHeader.predictionValue1
                        : E2E_TEST_IDS.homeHeader.predictionValue2
                  }
                  $dim={model.showDimmedPredictions}
                  numberOfLines={1}>
                  {p.sgv}
                </PredictionText>
              </PredictionItem>
            ))}
          </PredictionRow>
        </ExpandedPredictionWrap>
      ) : null}
    </Container>
  );
};

const E2EHidden = styled.View.attrs({collapsable: false})`
  position: absolute;
  top: 0px;
  left: 0px;
  opacity: 0.01;
  width: 1px;
  height: 1px;
`;

function gradientStyle(theme: ThemeType) {
  return {
    flexDirection: 'row' as const,
    justifyContent: 'flex-start' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    width: '100%' as const,
    borderRadius: theme.borderRadius,
    marginTop: theme.spacing.sm,
    minHeight: LOAD_BARS_CONSTANTS.rowHeight,
  };
}

const Container = styled.View<{theme: ThemeType}>`
  padding-left: ${(props: {theme: ThemeType}) => props.theme.spacing.md}px;
  padding-right: ${(props: {theme: ThemeType}) => props.theme.spacing.md}px;
`;

const TimeBgSection = styled.View`
  width: ${LOAD_BARS_CONSTANTS.timeBgSectionWidth}px;
  flex-shrink: 0;
  flex-direction: column;
  justify-content: center;
`;

const Row = styled.View`
  flex-direction: row;
  align-items: center;
`;

const BgValueText = styled.Text<{theme: ThemeType}>`
  font-size: ${(props: {theme: ThemeType}) => props.theme.typography.size.lg}px;
  font-weight: 800;
  color: ${(props: {theme: ThemeType}) => props.theme.textColor};
`;

const TimeText = styled.Text<{theme: ThemeType}>`
  margin-top: ${(props: {theme: ThemeType}) => props.theme.spacing.xs / 2}px;
  font-size: ${(props: {theme: ThemeType}) => props.theme.typography.size.xs}px;
  color: ${(props: {theme: ThemeType}) => props.theme.textColor};
`;

const DeltaSection = styled.View`
  width: ${LOAD_BARS_CONSTANTS.deltaSectionWidth}px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
`;

const DeltaText = styled.Text<{theme: ThemeType}>`
  font-size: ${(props: {theme: ThemeType}) => props.theme.typography.size.sm}px;
  font-weight: 700;
  color: ${(props: {theme: ThemeType}) => props.theme.textColor};
`;

const RightSection = styled.View<{theme: ThemeType}>`
  flex: 1;
  flex-shrink: 1;
  padding-left: ${(props: {theme: ThemeType}) => props.theme.spacing.md}px;
  justify-content: center;
`;

const PredictionRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
`;

const PredictionItem = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  margin-left: ${(props: {theme: ThemeType}) => props.theme.spacing.sm}px;
`;

const PredictionLabel = styled.Text<{$dim: boolean; theme: ThemeType}>`
  font-size: ${(props: {theme: ThemeType}) => props.theme.typography.size.xs}px;
  font-weight: 800;
  color: ${(props: {$dim: boolean; theme: ThemeType}) =>
    props.$dim ? props.theme.borderColor : props.theme.textColor};
`;

const PredictionArrow = styled.Text<{$dim: boolean; theme: ThemeType}>`
  font-size: ${(props: {theme: ThemeType}) => props.theme.typography.size.sm}px;
  font-weight: 900;
  margin-right: ${(props: {theme: ThemeType}) => props.theme.spacing.xs}px;
  color: ${(props: {$dim: boolean; theme: ThemeType}) =>
    props.$dim ? props.theme.borderColor : props.theme.textColor};
`;

const PredictionText = styled.Text<{$dim: boolean; theme: ThemeType}>`
  font-size: ${(props: {theme: ThemeType}) => props.theme.typography.size.sm}px;
  font-weight: 800;
  color: ${(props: {$dim: boolean; theme: ThemeType}) =>
    props.$dim ? props.theme.borderColor : props.theme.textColor};
`;

const ExpandedPredictionWrap = styled.View<{theme: ThemeType}>`
  margin-top: ${(props: {theme: ThemeType}) => props.theme.spacing.xs}px;
  padding-left: ${(props: {theme: ThemeType}) => props.theme.spacing.md}px;
  padding-right: ${(props: {theme: ThemeType}) => props.theme.spacing.md}px;
`;

export default React.memo(SmartExpandableHeader);
