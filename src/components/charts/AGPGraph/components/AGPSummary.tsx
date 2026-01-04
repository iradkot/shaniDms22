import React, {useMemo} from 'react';
import {View, Dimensions} from 'react-native';
import {StackActions, useNavigation} from '@react-navigation/native';
import styled, {useTheme} from 'styled-components/native';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {addOpacity} from 'app/style/styling.utils';
import {BgSample} from 'app/types/day_bgs.types';
import {useAGPData} from '../hooks/useAGPData';
import {formatGlucose, formatPercentage} from '../utils/statistics';
import AGPChart from './AGPChart';
import AGPKeyMetrics from './AGPKeyMetrics';
import FullScreenButton from 'app/components/common-ui/FullScreenButton/FullScreenButton';
import {FULL_SCREEN_VIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

const Container = styled.View``;

const HeaderRow = styled.View`
  width: 100%;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  padding-top: 8px;
  padding-right: 8px;
`;

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

  /**
   * Whether to show the fullscreen button.
   * Defaults to true.
   */
  showFullScreenButton?: boolean;
}

const AGPSummary: React.FC<AGPSummaryProps> = ({
  bgData,
  width,
  height = 260,
  testID,
  showFullScreenButton = true,
}) => {
  const theme = useTheme();
  const navigation = useNavigation();
  const {agpData, isLoading, error} = useAGPData(bgData);

  const openFullScreen = useMemo(() => {
    const params = {mode: 'agpGraph' as const, bgData};
    const action = StackActions.push(FULL_SCREEN_VIEW_SCREEN, params);

    return () => {
      const parent = (navigation as any)?.getParent?.();
      if (parent?.dispatch) {
        parent.dispatch(action);
        return;
      }
      if ((navigation as any)?.dispatch) {
        (navigation as any).dispatch(action);
        return;
      }
      (navigation as any).navigate?.(FULL_SCREEN_VIEW_SCREEN, params);
    };
  }, [bgData, navigation]);

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
      {showFullScreenButton ? (
        <HeaderRow>
          <FullScreenButton
            testID={E2E_TEST_IDS.charts.agpSummaryFullScreenButton}
            onPress={openFullScreen}
          />
        </HeaderRow>
      ) : null}

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
