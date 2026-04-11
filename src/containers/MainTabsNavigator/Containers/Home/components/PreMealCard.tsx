import React, {useMemo} from 'react';
import styled, {useTheme} from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import type {ThemeType} from 'app/types/theme';
import type {BgSample} from 'app/types/day_bgs.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import type {MealSegment} from 'app/containers/MainTabsNavigator/Containers/Home/hooks/useMealSegments';
import {addOpacity} from 'app/style/styling.utils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

type Props = {
  latestBgSample?: BgSample;
  insulinData: InsulinDataEntry[];
  lastMealSegment: MealSegment | null;
};

function formatMinutesAgo(ms: number, language: 'en' | 'he'): string {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return tr(language, 'home.justNow');
  if (min === 1) return tr(language, 'home.oneMinAgo');
  if (min < 60) return tr(language, 'home.minAgo', {count: min});
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? tr(language, 'home.hourMinAgo', {h, m}) : tr(language, 'home.hourAgo', {h});
}

function trendLabel(direction: string | undefined, language: 'en' | 'he'): string {
  switch (direction) {
    case 'DoubleUp': return tr(language, 'home.trendDoubleUp');
    case 'SingleUp': return tr(language, 'home.trendSingleUp');
    case 'FortyFiveUp': return tr(language, 'home.trend45Up');
    case 'Flat': return tr(language, 'home.trendFlat');
    case 'FortyFiveDown': return tr(language, 'home.trend45Down');
    case 'SingleDown': return tr(language, 'home.trendSingleDown');
    case 'DoubleDown': return tr(language, 'home.trendDoubleDown');
    default: return '—';
  }
}

const PreMealCard: React.FC<Props> = ({latestBgSample, insulinData, lastMealSegment}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();

  const lastBolus = useMemo(() => {
    const boluses = insulinData
      .filter(e => e.type === 'bolus' && e.amount && e.timestamp)
      .map(e => ({amount: e.amount!, timestampMs: new Date(e.timestamp!).getTime()}))
      .sort((a, b) => b.timestampMs - a.timestampMs);
    return boluses[0] ?? null;
  }, [insulinData]);

  const iob = latestBgSample?.iob;
  const bgColor = latestBgSample ? theme.determineBgColorByGlucoseValue(latestBgSample.sgv) : theme.borderColor;

  return (
    <CardContainer>
      <CardTitle>{tr(language, 'home.preMealTitle')}</CardTitle>
      <MetricsRow>
        <MetricBox>
          <MetricLabel>{tr(language, 'home.bgNow')}</MetricLabel>
          <MetricValueRow><BgValue style={{color: bgColor}}>{latestBgSample?.sgv ?? '—'}</BgValue></MetricValueRow>
          <TrendText>{trendLabel(latestBgSample?.direction, language)}</TrendText>
        </MetricBox>

        <MetricBox>
          <MetricLabel>{tr(language, 'home.activeIob')}</MetricLabel>
          <MetricValueRow>
            <Icon name="needle" size={16} color={theme.colors.insulin} />
            <MetricValue>{iob != null ? `${iob.toFixed(1)}u` : '—'}</MetricValue>
          </MetricValueRow>
          <MetricSub>{tr(language, 'home.iobSub')}</MetricSub>
        </MetricBox>

        <MetricBox>
          <MetricLabel>{tr(language, 'home.lastBolus')}</MetricLabel>
          <MetricValueRow><MetricValue>{lastBolus ? `${lastBolus.amount.toFixed(1)}u` : '—'}</MetricValue></MetricValueRow>
          <MetricSub>{lastBolus ? formatMinutesAgo(lastBolus.timestampMs, language) : tr(language, 'home.noneToday')}</MetricSub>
        </MetricBox>
      </MetricsRow>

      {lastMealSegment ? (
        <LastMealRow>
          <Icon name="food-apple-outline" size={14} color={theme.colors.carbs} />
          <LastMealText>
            <BoldText>{lastMealSegment.label}</BoldText>
            {lastMealSegment.totalCarbs > 0 ? ` · ${Math.round(lastMealSegment.totalCarbs)}g carbs` : ''}
            {lastMealSegment.totalBolus > 0 ? ` · ${lastMealSegment.totalBolus.toFixed(1)}u bolus` : ''}
            {lastMealSegment.bgBefore != null && lastMealSegment.bgPeak != null ? ` · ${lastMealSegment.bgBefore}→${lastMealSegment.bgPeak} peak` : ''}
          </LastMealText>
        </LastMealRow>
      ) : null}
    </CardContainer>
  );
};

const CardContainer = styled.View<{theme: ThemeType}>`
  margin-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius + 4}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.1)};
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.white, 0.95)};
`;
const CardTitle = styled.Text<{theme: ThemeType}>`font-size:${(p:any)=>p.theme.typography.size.sm}px;font-weight:800;color:${(p:any)=>p.theme.textColor};margin-bottom:${(p:any)=>p.theme.spacing.sm}px;`;
const MetricsRow = styled.View`flex-direction: row;justify-content: space-between;`;
const MetricBox = styled.View`flex:1;align-items:center;`;
const MetricLabel = styled.Text<{theme: ThemeType}>`font-size:${(p:any)=>p.theme.typography.size.xs}px;font-weight:600;color:${(p:any)=>addOpacity(p.theme.textColor,0.6)};margin-bottom:${(p:any)=>p.theme.spacing.xs}px;`;
const MetricValueRow = styled.View`flex-direction: row;align-items: center;`;
const BgValue = styled.Text<{theme: ThemeType}>`font-size:${(p:any)=>p.theme.typography.size.lg}px;font-weight:800;`;
const MetricValue = styled.Text<{theme: ThemeType}>`font-size:${(p:any)=>p.theme.typography.size.md}px;font-weight:700;color:${(p:any)=>p.theme.textColor};margin-left:${(p:any)=>p.theme.spacing.xs}px;`;
const MetricSub = styled.Text<{theme: ThemeType}>`font-size:${(p:any)=>p.theme.typography.size.xs - 1}px;color:${(p:any)=>addOpacity(p.theme.textColor,0.5)};margin-top:2px;`;
const TrendText = styled.Text<{theme: ThemeType}>`font-size:${(p:any)=>p.theme.typography.size.xs - 1}px;font-weight:600;color:${(p:any)=>addOpacity(p.theme.textColor,0.6)};margin-top:2px;`;
const LastMealRow = styled.View<{theme: ThemeType}>`flex-direction:row;align-items:center;margin-top:${(p:any)=>p.theme.spacing.sm}px;padding-top:${(p:any)=>p.theme.spacing.sm}px;border-top-width:1px;border-top-color:${(p:any)=>addOpacity(p.theme.textColor,0.08)};`;
const LastMealText = styled.Text<{theme: ThemeType}>`flex:1;font-size:${(p:any)=>p.theme.typography.size.xs}px;color:${(p:any)=>addOpacity(p.theme.textColor,0.7)};margin-left:${(p:any)=>p.theme.spacing.sm}px;`;
const BoldText = styled.Text<{theme: ThemeType}>`font-weight:700;color:${(p:any)=>p.theme.textColor};`;

export default React.memo(PreMealCard);
