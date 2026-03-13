import React from 'react';
import {ActivityIndicator, Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {DEFAULT_NIGHT_WINDOW, formatHourWindowLabel} from 'app/constants/GLUCOSE_WINDOWS';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

type Props = {
  avgTddUPerDay: number | null;
  basalPct: number | null;
  bolusPct: number | null;
  hyposPerWeek: number;
  nightTirPct: number | null;
  avgCarbsGPerDay: number | null;

  longestHypoDurationLabel?: string | null;

  avgTddTestID?: string;

  onPressSevereHypos?: () => void;

  isSevereHyposLoading?: boolean;
};

const Section = styled.View.attrs({collapsable: false})`
  padding-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs + 2}px;
  padding-right: ${({theme}: {theme: ThemeType}) => theme.spacing.sm + 2}px;
  padding-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.xs + 2}px;
  padding-left: ${({theme}: {theme: ThemeType}) => theme.spacing.sm + 2}px;
`;

const CardRow = styled.View.attrs({collapsable: false})`
  flex-direction: row;
  justify-content: flex-start;
  margin-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
`;

const CardWrap = styled.View.attrs({collapsable: false})<{$withGap?: boolean}>`
  flex: 1;
  margin-right: ${({$withGap, theme}: {$withGap?: boolean; theme: ThemeType}) =>
    $withGap ? theme.spacing.sm : 0}px;
`;

const CardSurface = styled.View.attrs({collapsable: false})`
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-radius: 12px;
  padding: 12px;
  width: 100%;
  border-width: 1px;
  border-color: transparent;
`;

const PressableCardSurface = styled(Pressable).attrs(({theme}: {theme: ThemeType}) => ({
  collapsable: false,
  android_ripple: {color: addOpacity(theme.accentColor, 0.12)},
}))`
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.accentColor, 0.04)};
  border-radius: 12px;
  padding: 12px;
  width: 100%;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.accentColor, 0.35)};
  overflow: hidden;
`;

const TitleWrap = styled.View.attrs({collapsable: false})`
  position: relative;
`;

const CardTitle = styled.Text`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.8)};
`;

const CardValue = styled.Text<{color?: string}>`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs + 2}px;
  font-size: 18px;
  font-weight: 800;
  color: ${({theme, color}: {theme: ThemeType; color?: string}) => color ?? theme.textColor};
`;

const CardSubtle = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: 12px;
  font-weight: 600;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.65)};
`;

const RightIconWrap = styled.View`
  width: 26px;
  height: 26px;
  border-radius: 13px;
  align-items: center;
  justify-content: center;
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.accentColor, 0.10)};
  position: absolute;
  right: 0px;
  top: -4px;
`;

function fmtMaybe(value: number | null, suffix = ''): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value}${suffix}`;
}

export const QuickStatsRow: React.FC<Props> = ({
  avgTddUPerDay,
  basalPct,
  bolusPct,
  hyposPerWeek,
  nightTirPct,
  avgCarbsGPerDay,
  longestHypoDurationLabel,
  avgTddTestID,
  onPressSevereHypos,
  isSevereHyposLoading,
}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();

  const avgTddRounded =
    typeof avgTddUPerDay === 'number' && Number.isFinite(avgTddUPerDay)
      ? Number(avgTddUPerDay.toFixed(1))
      : null;

  const severeHypoThresholdRaw = cgmRange[CGM_STATUS_CODES.EXTREME_LOW];
  const severeHypoThreshold =
    typeof severeHypoThresholdRaw === 'number' && Number.isFinite(severeHypoThresholdRaw)
      ? severeHypoThresholdRaw
      : cgmRange.TARGET.min;

  const basalBolusText =
    typeof basalPct === 'number' && typeof bolusPct === 'number'
      ? `${Math.round(basalPct)}% / ${Math.round(bolusPct)}%`
      : '—';

  return (
    <Section>
      <CardRow>
        <CardWrap $withGap>
          <CardSurface testID={avgTddTestID} collapsable={false}>
            <CardTitle numberOfLines={1}>{tr(language, 'trends.avgTdd')}</CardTitle>
            <CardValue>{fmtMaybe(avgTddRounded, ' U/day')}</CardValue>
            <CardSubtle>{tr(language, 'trends.basalPlusBolus')}</CardSubtle>
          </CardSurface>
        </CardWrap>

        <CardWrap>
          <CardSurface>
            <CardTitle numberOfLines={1}>{tr(language, 'trends.basalBolus')}</CardTitle>
            <CardValue>{basalBolusText}</CardValue>
            <CardSubtle>{tr(language, 'trends.percentOfTotal')}</CardSubtle>
          </CardSurface>
        </CardWrap>
      </CardRow>

      <SectionLabelWrap>
        <SectionLabel>{tr(language, 'trends.hypoInvestigation')}</SectionLabel>
      </SectionLabelWrap>

      <CardRow>
        <CardWrap $withGap>
          {onPressSevereHypos ? (
            <PressableCardSurface
              testID={E2E_TEST_IDS.trends.quickStatsSevereHyposCard}
              accessibilityRole="button"
              accessibilityLabel={tr(language, 'trends.severeHypos')}
              accessibilityHint={tr(language, 'trends.opensHypoInvestigation')}
              accessibilityState={{disabled: Boolean(isSevereHyposLoading)}}
              disabled={Boolean(isSevereHyposLoading)}
              onPress={onPressSevereHypos}
              style={({pressed}: {pressed: boolean}) => ({
                opacity: isSevereHyposLoading ? 0.6 : pressed ? 0.86 : 1,
                transform: [{scale: pressed ? 0.99 : 1}],
              })}
            >
              <TitleWrap>
                <View style={{paddingRight: 32}}>
                  <CardTitle numberOfLines={1}>{tr(language, 'trends.severeHypos')}</CardTitle>
                </View>
                {isSevereHyposLoading ? (
                  <RightIconWrap>
                    <ActivityIndicator size="small" color={theme.accentColor} />
                  </RightIconWrap>
                ) : (
                  <RightIconWrap>
                    <Icon name="chevron-right" size={18} color={theme.accentColor} />
                  </RightIconWrap>
                )}
              </TitleWrap>
              <CardValue>{`${hyposPerWeek.toFixed(1)}/wk`}</CardValue>
              <CardSubtle>
                {isSevereHyposLoading
                  ? tr(language, 'trends.opening')
                  : tr(language, 'trends.eventsBelowThreshold', {threshold: severeHypoThreshold})}
              </CardSubtle>
            </PressableCardSurface>
          ) : (
            <CardSurface>
              <CardTitle numberOfLines={1}>{tr(language, 'trends.severeHypos')}</CardTitle>
              <CardValue>{`${hyposPerWeek.toFixed(1)}/wk`}</CardValue>
              <CardSubtle>{tr(language, 'trends.eventsBelowThreshold', {threshold: severeHypoThreshold})}</CardSubtle>
            </CardSurface>
          )}
        </CardWrap>

        <CardWrap>
          {onPressSevereHypos ? (
            <PressableCardSurface
              testID={E2E_TEST_IDS.trends.quickStatsLongestHypoCard}
              accessibilityRole="button"
              accessibilityLabel={tr(language, 'trends.longestHypo')}
              accessibilityHint={tr(language, 'trends.opensHypoInvestigation')}
              accessibilityState={{disabled: Boolean(isSevereHyposLoading)}}
              disabled={Boolean(isSevereHyposLoading)}
              onPress={onPressSevereHypos}
              style={({pressed}: {pressed: boolean}) => ({
                opacity: isSevereHyposLoading ? 0.6 : pressed ? 0.86 : 1,
                transform: [{scale: pressed ? 0.99 : 1}],
              })}
            >
              <TitleWrap>
                <View style={{paddingRight: 32}}>
                  <CardTitle numberOfLines={1}>{tr(language, 'trends.longestHypo')}</CardTitle>
                </View>
                {isSevereHyposLoading ? (
                  <RightIconWrap>
                    <ActivityIndicator size="small" color={theme.accentColor} />
                  </RightIconWrap>
                ) : (
                  <RightIconWrap>
                    <Icon name="chevron-right" size={18} color={theme.accentColor} />
                  </RightIconWrap>
                )}
              </TitleWrap>
              <CardValue>{longestHypoDurationLabel ?? '—'}</CardValue>
              <CardSubtle>In this range</CardSubtle>
            </PressableCardSurface>
          ) : (
            <CardSurface>
              <CardTitle numberOfLines={1}>{tr(language, 'trends.longestHypo')}</CardTitle>
              <CardValue>{longestHypoDurationLabel ?? '—'}</CardValue>
              <CardSubtle>{tr(language, 'trends.inThisRange')}</CardSubtle>
            </CardSurface>
          )}
        </CardWrap>
      </CardRow>

      <CardRow>
        <CardWrap $withGap>
          <CardSurface>
            <CardTitle numberOfLines={1}>{tr(language, 'trends.nightTir')}</CardTitle>
            <CardValue>{fmtMaybe(nightTirPct !== null ? Math.round(nightTirPct) : null, '%')}</CardValue>
            <CardSubtle>{formatHourWindowLabel(DEFAULT_NIGHT_WINDOW)}</CardSubtle>
          </CardSurface>
        </CardWrap>

        <CardWrap>
          <CardSurface>
            <CardTitle numberOfLines={1}>{tr(language, 'trends.avgCarbs')}</CardTitle>
            <CardValue>{fmtMaybe(avgCarbsGPerDay !== null ? Math.round(avgCarbsGPerDay) : null, ' g/day')}</CardValue>
            <CardSubtle>{tr(language, 'trends.treatmentsCarbs')}</CardSubtle>
          </CardSurface>
        </CardWrap>
      </CardRow>
    </Section>
  );
};

const SectionLabelWrap = styled.View`
  padding-left: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  padding-right: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  padding-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
`;

const SectionLabel = styled.Text`
  font-size: 12px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
`;

export default QuickStatsRow;
