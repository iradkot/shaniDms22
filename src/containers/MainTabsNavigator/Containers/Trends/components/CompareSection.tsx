// /Trends/components/CompareSection.tsx
import React, {useMemo} from 'react';
import {View, Button, ActivityIndicator, Dimensions, Text} from 'react-native';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {
  CompareBox,
  ExplanationText,
  StatRow,
  StatLabel,
  StatValue,
  Subtle,
  ComparisonTitle,
  ComparisonSubtitle,
  StatChange,
  ComparisonDateRange,
} from '../styles/Trends.styles';
import {calculateTrendsMetrics} from '../utils/trendsCalculations';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';
import {BgSample} from 'app/types/day_bgs.types';
import {useAGPData} from 'app/components/charts/AGPGraph/hooks/useAGPData';
import AGPChart from 'app/components/charts/AGPGraph/components/AGPChart';
import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {addOpacity} from 'app/style/styling.utils';

interface CompareSectionProps {
  showComparison: boolean;
  comparing: boolean;
  handleCompare: () => void;
  rangeDays: number;
  currentBgData: BgSample[];
  previousBgData: BgSample[];
  currentMetrics: ReturnType<typeof calculateTrendsMetrics>;
  previousMetrics: ReturnType<typeof calculateTrendsMetrics> | null;
  comparisonDateRange: {start: Date; end: Date} | null;
  changeComparisonPeriod: (direction: 'back' | 'forward') => void;
  hideComparison: () => void;
}

const ComparisonAgpChart: React.FC<{
  title: string;
  subtitle: string;
  bgData: BgSample[];
}> = ({title, subtitle, bgData}) => {
  const theme = useTheme() as ThemeType;
  const {agpData, isLoading, error} = useAGPData(bgData);

  const chartWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    return Math.max(260, Math.floor(screenWidth - theme.spacing.lg * 4));
  }, [theme.spacing.lg]);

  const muted = addOpacity(theme.textColor, 0.68);

  return (
    <View
      style={{
        backgroundColor: theme.white,
        borderColor: addOpacity(theme.textColor, 0.12),
        borderRadius: 6,
        borderWidth: 1,
        marginBottom: theme.spacing.sm + 2,
        padding: theme.spacing.sm + 2,
      }}>
      <Text style={{color: theme.textColor, fontSize: 15, fontWeight: '700'}}>
        {title}
      </Text>
      <Text
        style={{
          color: muted,
          fontSize: 12,
          marginBottom: theme.spacing.xs + 1,
        }}>
        {subtitle}
      </Text>

      {isLoading ? (
        <ActivityIndicator size="small" color={theme.accentColor} />
      ) : error || !agpData ? (
        <Text style={{color: muted}}>No AGP data for this period.</Text>
      ) : (
        <>
          <AGPChart
            agpData={agpData}
            width={chartWidth}
            height={190}
            targetRange={cgmRange.TARGET}
          />
          <Text style={{color: muted, fontSize: 12, textAlign: 'center'}}>
            {agpData.dateRange.days} days • {agpData.statistics.totalReadings}{' '}
            readings
          </Text>
        </>
      )}
    </View>
  );
};

export const CompareSection: React.FC<CompareSectionProps> = ({
  showComparison,
  comparing,
  handleCompare,
  rangeDays,
  currentBgData,
  previousBgData,
  currentMetrics,
  previousMetrics,
  comparisonDateRange,
  changeComparisonPeriod,
  hideComparison,
}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();

  if (!currentMetrics.dailyDetails.length) return null;

  const renderComparisonValue = (
    current: number,
    previous: number,
    unit: string,
    lowerIsBetter = false,
  ) => {
    const diff = current - previous;
    const diffPercentage = previous !== 0 ? (diff / previous) * 100 : 0;

    const isImprovement = diff > 0 ? lowerIsBetter : !lowerIsBetter;
    const color = isImprovement ? theme.inRangeColor : theme.belowRangeColor;

    return (
      <View>
        <StatValue>
          {current.toFixed(1)} {unit}
        </StatValue>
        <Subtle>
          vs {previous.toFixed(1)} {unit}
        </Subtle>
        <StatChange color={color}>
          {diff.toFixed(1)} ({diffPercentage.toFixed(0)}%)
        </StatChange>
      </View>
    );
  };

  return (
    <View style={{marginVertical: theme.spacing.sm + 2}}>
      {!showComparison && !comparing && (
        <Button
          title={tr(language, 'trends.comparePrevious')}
          onPress={handleCompare}
          color={theme.accentColor}
        />
      )}
      {comparing && (
        <ActivityIndicator size="large" color={theme.accentColor} />
      )}

      {showComparison && previousMetrics && comparisonDateRange && (
        <CompareBox>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
            <ComparisonTitle>
              {tr(language, 'trends.comparison')}
            </ComparisonTitle>
            <Button
              title={tr(language, 'trends.hide')}
              onPress={hideComparison}
              color={theme.belowRangeColor}
            />
          </View>
          <ComparisonSubtitle>
            {tr(language, 'trends.currentVsPeriod', {rangeDays})}
          </ComparisonSubtitle>
          <ComparisonDateRange>
            {comparisonDateRange.start.toDateString()} -{' '}
            {comparisonDateRange.end.toDateString()}
          </ComparisonDateRange>

          <View style={{marginBottom: theme.spacing.sm + 2}}>
            <ComparisonAgpChart
              title={language === 'he' ? 'AGP נוכחי' : 'Current AGP'}
              subtitle={`${startOfCurrentLabel(
                language,
              )} ${rangeDays} ${daysLabel(language, rangeDays)}`}
              bgData={currentBgData}
            />
            <ComparisonAgpChart
              title={
                language === 'he'
                  ? 'AGP של התקופה הקודמת'
                  : 'Previous-period AGP'
              }
              subtitle={`${comparisonDateRange.start.toDateString()} - ${comparisonDateRange.end.toDateString()}`}
              bgData={previousBgData}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              marginBottom: theme.spacing.sm + 2,
            }}>
            <Button
              title={tr(language, 'trends.shiftBack')}
              onPress={() => changeComparisonPeriod('back')}
            />
            <Button
              title={tr(language, 'trends.shiftForward')}
              onPress={() => changeComparisonPeriod('forward')}
            />
          </View>

          <StatRow>
            <StatLabel>{tr(language, 'trends.averageBg')}</StatLabel>
            {renderComparisonValue(
              currentMetrics.averageBg,
              previousMetrics.averageBg,
              'mg/dL',
              true,
            )}
          </StatRow>

          <StatRow>
            <StatLabel>{tr(language, 'trends.timeInRangeTir')}</StatLabel>
            {renderComparisonValue(
              currentMetrics.tir,
              previousMetrics.tir,
              '%',
            )}
          </StatRow>

          <StatRow>
            <StatLabel>{tr(language, 'trends.seriousHyposPerDay')}</StatLabel>
            {renderComparisonValue(
              currentMetrics.seriousHyposCount / rangeDays,
              previousMetrics.seriousHyposCount / rangeDays,
              'events/day',
              true,
            )}
          </StatRow>

          <StatRow>
            <StatLabel>{tr(language, 'trends.seriousHypersPerDay')}</StatLabel>
            {renderComparisonValue(
              currentMetrics.seriousHypersCount / rangeDays,
              previousMetrics.seriousHypersCount / rangeDays,
              'events/day',
              true,
            )}
          </StatRow>

          <ExplanationText style={{marginTop: theme.spacing.lg - 1}}>
            {tr(language, 'trends.compareInsight')}
          </ExplanationText>
        </CompareBox>
      )}
    </View>
  );
};

function startOfCurrentLabel(language: string) {
  return language === 'he' ? 'התקופה הנוכחית:' : 'Current period:';
}

function daysLabel(language: string, days: number) {
  if (language === 'he') return 'ימים';
  return days === 1 ? 'day' : 'days';
}
