import React, {useMemo} from 'react';
import {View, Dimensions} from 'react-native';
import styled, {useTheme} from 'styled-components/native';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {addOpacity} from 'app/style/styling.utils';
import {BgSample} from 'app/types/day_bgs.types';
import {useAGPData} from '../hooks/useAGPData';
import {formatGlucose, formatPercentage} from '../utils/statistics';
import AGPChart from './AGPChart';
import AGPKeyMetrics from './AGPKeyMetrics';

const Container = styled.View``;

const ErrorText = styled.Text<{color: string}>`
  text-align: center;
  color: ${({color}: {color: string}) => color};
`;

const Card = styled.View<{bg: string; border: string}>`
  background-color: ${({bg}: {bg: string}) => bg};
  border-radius: 12px;
  border-width: 1px;
  border-color: ${({border}: {border: string}) => border};
  padding: 12px;
`;

interface AGPSummaryProps {
  bgData: BgSample[];
  width?: number;
  height?: number;

  /**
   * Optional E2E selector for the AGP summary container.
   * This is intended for Maestro flows to validate chart presence.
   */
  testID?: string;
}

const AGPSummary: React.FC<AGPSummaryProps> = ({bgData, width, height = 260, testID}) => {
  const theme = useTheme();
  const {agpData, isLoading, error} = useAGPData(bgData);

  const computedWidth = useMemo(() => {
    const screenWidth = width ?? Dimensions.get('window').width;
    // Leave some horizontal breathing room inside Trends container padding.
    return Math.max(280, Math.floor(screenWidth - theme.spacing.lg * 2));
  }, [width, theme.spacing.lg]);

  const border = addOpacity(theme.borderColor, 0.9);
  const subtleText = addOpacity(theme.textColor, 0.7);

  if (isLoading) {
    return (
      <Container>
        <ErrorText color={subtleText}>Processing AGP…</ErrorText>
      </Container>
    );
  }

  if (error || !agpData) {
    return (
      <Container>
        <ErrorText color={theme.belowRangeColor}>
          Unable to generate AGP for this period.
        </ErrorText>
      </Container>
    );
  }

  const stats = agpData.statistics;

  const keyMetrics = {
    timeInRange: {
      label: 'Time in Range',
      value: formatPercentage(stats.timeInRange.target, 0),
      status:
        stats.timeInRange.target >= 70 ? 'good' : stats.timeInRange.target >= 50 ? 'fair' : 'poor',
      target: 'Target: ≥70%',
    },
    averageGlucose: {
      label: 'Avg Glucose',
      value: formatGlucose(stats.averageGlucose),
      status:
        stats.averageGlucose >= cgmRange.TARGET.min && stats.averageGlucose <= cgmRange.TARGET.max
          ? 'good'
          : stats.averageGlucose <= (cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number)
            ? 'fair'
            : 'poor',
      target: `Target: ${cgmRange.TARGET.min}-${cgmRange.TARGET.max}`,
    },
    gmi: {
      label: 'GMI',
      value: `${stats.gmi.toFixed(1)}%`,
      status: stats.gmi < 7.0 ? 'good' : stats.gmi < 8.0 ? 'fair' : 'poor',
      target: 'Target: <7.0%',
    },
    variability: {
      label: 'Variability',
      value: `${stats.cv.toFixed(1)}%`,
      status: stats.cv < 36 ? 'good' : stats.cv < 50 ? 'fair' : 'poor',
      target: 'Target: <36%',
    },
  } as const;

  return (
    <Container testID={testID}>
      <View style={{marginBottom: theme.spacing.md}}>
        <AGPKeyMetrics metrics={keyMetrics} />
      </View>

      <Card bg={theme.white} border={border}>
        <AGPChart agpData={agpData} width={computedWidth} height={height} targetRange={cgmRange.TARGET} />
        <View style={{marginTop: theme.spacing.sm}}>
          <ErrorText color={subtleText}>
            {agpData.dateRange.days} days • {stats.totalReadings} readings
          </ErrorText>
        </View>
      </Card>
    </Container>
  );
};

export default AGPSummary;
