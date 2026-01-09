import React, {useMemo} from 'react';
import styled, {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {
  formatCob,
  formatIob,
  LOAD_BARS_CONSTANTS,
  toBarPercent,
} from 'app/utils/loadBars.utils';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

/**
 * Visualizes current "load" context for a BG entry.
 *
 * - IOB is shown as a single bar with optional stacked segments (bolus vs auto/basal).
 * - COB is shown as a single bar.
 * - Scaling uses precomputed references from the parent list for performance.
 */
type Props = {
  iobTotal?: number;
  iobBolus?: number;
  iobBasal?: number;
  cob?: number;
  maxIobReference: number;
  maxCobReference: number;
};

const LoadBars: React.FC<Props> = ({
  iobTotal,
  iobBolus,
  iobBasal,
  cob,
  maxIobReference,
  maxCobReference,
}) => {
  const theme = useTheme() as ThemeType;

  const hasSplitIob = useMemo(() => {
    const bolusOk = typeof iobBolus === 'number' && Number.isFinite(iobBolus);
    const basalOk = typeof iobBasal === 'number' && Number.isFinite(iobBasal);
    return bolusOk || basalOk;
  }, [iobBasal, iobBolus]);

  const safeIobBolus = useMemo(() => {
    const value = typeof iobBolus === 'number' ? iobBolus : undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
    // Fallback: if split isn't available, treat total as bolus.
    if (typeof iobTotal === 'number' && Number.isFinite(iobTotal)) return Math.max(0, iobTotal);
    return 0;
  }, [iobBolus, iobTotal]);

  const safeIobBasal = useMemo(() => {
    const value = typeof iobBasal === 'number' ? iobBasal : undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
    return 0;
  }, [iobBasal]);

  const safeIobTotal = useMemo(() => {
    const total =
      typeof iobTotal === 'number' && Number.isFinite(iobTotal)
        ? Math.max(0, iobTotal)
        : safeIobBolus + safeIobBasal;
    return total;
  }, [iobTotal, safeIobBolus, safeIobBasal]);

  const safeCob = useMemo(() => {
    const value = typeof cob === 'number' ? cob : undefined;
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  }, [cob]);

  const iobFill = useMemo(
    () => toBarPercent({value: safeIobTotal, referenceMax: maxIobReference}),
    [safeIobTotal, maxIobReference],
  );

  const cobFill = useMemo(
    () => toBarPercent({value: safeCob, referenceMax: maxCobReference}),
    [safeCob, maxCobReference],
  );

  const iobLabel = useMemo(() => {
    const totalText = formatIob(safeIobTotal);
    if (!hasSplitIob) return totalText;

    const bolus = typeof iobBolus === 'number' && Number.isFinite(iobBolus) ? Math.max(0, iobBolus) : 0;
    const basal = typeof iobBasal === 'number' && Number.isFinite(iobBasal) ? Math.max(0, iobBasal) : 0;
    return `${totalText} (${formatIob(bolus)} bolus, ${formatIob(basal)} basal)`;
  }, [hasSplitIob, iobBasal, iobBolus, safeIobTotal]);

  return (
    <Container testID={E2E_TEST_IDS.loadBars.container}>
      <BarRow>
        <ValueText testID={E2E_TEST_IDS.loadBars.iobText} numberOfLines={1}>
          {iobLabel}
        </ValueText>
        <LabelGap />
        <Track $color={theme.colors.barTrack}>
          {iobFill.percent > 0 ? (
            <FilledWrap $percent={iobFill.percent} $minWidthPx={iobFill.minWidthPx}>
              <Segment $color={theme.colors.insulin} $flex={safeIobBolus} />
              <Segment $color={theme.colors.insulinSecondary} $flex={safeIobBasal} />
            </FilledWrap>
          ) : null}
        </Track>
      </BarRow>

      <BlockGap />

      <BarRow>
        <ValueText testID={E2E_TEST_IDS.loadBars.cobText} numberOfLines={1}>
          {formatCob(safeCob)}
        </ValueText>
        <LabelGap />
        <Track $color={theme.colors.barTrack}>
          {cobFill.percent > 0 ? (
            <Fill
              $color={theme.colors.carbs}
              $percent={cobFill.percent}
              $minWidthPx={cobFill.minWidthPx}
            />
          ) : null}
        </Track>
      </BarRow>
    </Container>
  );
};

const Container = styled.View`
  flex: 1;
  flex-shrink: 1;
  flex-direction: column;
  justify-content: center;
`;

const BarRow = styled.View`
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
`;

const ValueText = styled.Text<{theme: ThemeType}>`
  font-size: ${(props: {theme: ThemeType}) => props.theme.typography.size.xs}px;
  font-weight: 700;
  color: ${(props: {theme: ThemeType}) => props.theme.textColor};
`;

const Track = styled.View<{$color: string}>`
  height: ${LOAD_BARS_CONSTANTS.barHeight}px;
  border-radius: ${LOAD_BARS_CONSTANTS.barRadius}px;
  overflow: hidden;
  background-color: ${(props: {$color: string}) => props.$color};
  width: 100%;
`;

const FilledWrap = styled.View<{$percent: number; $minWidthPx: number}>`
  height: 100%;
  flex-direction: row;
  overflow: hidden;
  border-radius: ${LOAD_BARS_CONSTANTS.barRadius}px;
  width: ${(props: {$percent: number}) => props.$percent}%;
  min-width: ${(props: {$minWidthPx: number}) => (props.$minWidthPx > 0 ? props.$minWidthPx : 0)}px;
`;

const Segment = styled.View<{$color: string; $flex: number}>`
  height: 100%;
  background-color: ${(props: {$color: string}) => props.$color};
  flex: ${(props: {$flex: number}) => (props.$flex > 0 ? props.$flex : 0)};
`;

const Fill = styled.View<{$color: string; $percent: number; $minWidthPx: number}>`
  height: 100%;
  background-color: ${(props: {$color: string}) => props.$color};
  border-radius: ${LOAD_BARS_CONSTANTS.barRadius}px;
  width: ${(props: {$percent: number}) => props.$percent}%;
  min-width: ${(props: {$minWidthPx: number}) => (props.$minWidthPx > 0 ? props.$minWidthPx : 0)}px;
`;

const LabelGap = styled.View`
  height: ${LOAD_BARS_CONSTANTS.labelToTrackGapPx}px;
`;

const BlockGap = styled.View`
  height: ${(props: {theme: ThemeType}) => props.theme.spacing.xs}px;
`;

export default React.memo(LoadBars);
