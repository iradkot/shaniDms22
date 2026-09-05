import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  getChartPalette,
  glucoseChartColor,
} from 'app/components/charts/chartPalette';
import styled, {useTheme} from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {BgSample} from 'app/types/day_bgs.types';
import {ThemeType} from 'app/types/theme';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {
  addOpacity,
  determineBgColorByGlucoseValue,
} from 'app/style/styling.utils';
import {InsulinDataEntry} from 'app/types/insulin.types';
import {CarbEvent} from 'app/components/charts/CgmGraph/utils/carbsUtils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';
import {
  formatBolusCloseEventsDetails,
  formatCarbCloseEventsDetails,
  formatIobSplitLabel,
} from 'app/utils/tooltipFormatting.utils';

type Props = {
  compact?: boolean;
  locale?: 'en' | 'he' | undefined;
  anchorTimeMs: number;
  bgSample: BgSample | null;
  activeInsulinU: number | null;
  activeInsulinBolusU?: number | null | undefined;
  activeInsulinBasalU?: number | null | undefined;
  cobG: number | null;
  basalRateUhr: number | null;
  bolusSummary: {count: number; totalU: number};
  carbsSummary: {count: number; totalG: number};

  /** Optional: show the nearby events that were grouped into the summary. */
  bolusEvents?:
    | Array<
        InsulinDataEntry & {type: 'bolus'; amount: number; timestamp: string}
      >
    | undefined;
  carbEvents?:
    | Array<CarbEvent & {id: string; timestamp: number; carbs: number}>
    | undefined;

  /**
   * When true (default), the tooltip stretches to the available width.
   * When false, it sizes to its content (useful for landscape/fullscreen docking).
   */
  fullWidth?: boolean | undefined;

  /**
   * Optional max width constraint (px).
   */
  maxWidthPx?: number | undefined;
};

const HomeChartsTooltip: React.FC<Props> = ({
  compact = false,
  locale,
  anchorTimeMs,
  bgSample,
  activeInsulinU,
  activeInsulinBolusU,
  activeInsulinBasalU,
  cobG,
  basalRateUhr,
  bolusSummary,
  carbsSummary,
  bolusEvents,
  carbEvents,
  fullWidth = true,
  maxWidthPx,
}) => {
  const theme = useTheme() as ThemeType;
  const compactStyles = useMemo(() => createCompactStyles(theme), [theme]);
  const {language: contextLanguage} = useAppLanguage();
  const language = locale ?? contextLanguage;

  const timeText = useMemo(
    () => formatDateToLocaleTimeString(anchorTimeMs),
    [anchorTimeMs],
  );
  const bgText = useMemo(() => {
    if (!bgSample) {
      return '—';
    }
    return `${Math.round(bgSample.sgv)} mg/dL`;
  }, [bgSample]);
  const bgColor = useMemo(() => {
    if (!bgSample) {
      return theme.textColor;
    }
    return compact
      ? glucoseChartColor(bgSample.sgv, theme)
      : determineBgColorByGlucoseValue(bgSample.sgv, theme);
  }, [bgSample, compact, theme]);

  const bgTrendIcon = useMemo(() => {
    const dir = bgSample?.direction;
    switch (dir) {
      case 'DoubleUp':
        return 'chevron-double-up';
      case 'SingleUp':
        return 'chevron-up';
      case 'FortyFiveUp':
        return 'arrow-top-right';
      case 'Flat':
        return 'arrow-right';
      case 'FortyFiveDown':
        return 'arrow-bottom-right';
      case 'SingleDown':
        return 'chevron-down';
      case 'DoubleDown':
        return 'chevron-double-down';
      case 'NOT COMPUTABLE':
      case 'RATE OUT OF RANGE':
        return 'help-circle-outline';
      default:
        return null;
    }
  }, [bgSample?.direction]);

  const activeText = useMemo(() => {
    return formatIobSplitLabel({
      totalU: activeInsulinU,
      digits: 2,
      formatTotal: u => `${u.toFixed(2)} U`,
    });
  }, [activeInsulinU]);
  const activeDetailsText = useMemo(() => {
    const finite = (value: number | null | undefined): value is number =>
      typeof value === 'number' && Number.isFinite(value);
    if (
      !finite(activeInsulinU) ||
      (!finite(activeInsulinBolusU) && !finite(activeInsulinBasalU))
    ) {
      return null;
    }
    const units = (value: number | null | undefined): string =>
      finite(value) ? `${value.toFixed(2)} U` : '—';
    return `${tr(language, 'home.tooltipBolus')} ${units(
      activeInsulinBolusU,
    )} · ${tr(language, 'home.tooltipBasal')} ${units(activeInsulinBasalU)}`;
  }, [activeInsulinBasalU, activeInsulinBolusU, activeInsulinU, language]);
  const basalText =
    basalRateUhr != null && Number.isFinite(basalRateUhr)
      ? `${basalRateUhr.toFixed(2)} U/hr`
      : '—';
  const cobText =
    cobG != null && Number.isFinite(cobG) ? `${Math.round(cobG)} g` : '—';
  const bolusText =
    bolusSummary.count > 0
      ? `${bolusSummary.totalU.toFixed(2)} U (${bolusSummary.count})`
      : '—';
  const carbsText =
    carbsSummary.count > 0
      ? `${Math.round(carbsSummary.totalG)} g (${carbsSummary.count})`
      : '—';

  const bolusDetailsText = useMemo(() => {
    return formatBolusCloseEventsDetails(bolusEvents ?? []);
  }, [bolusEvents]);

  const carbDetailsText = useMemo(() => {
    return formatCarbCloseEventsDetails((carbEvents ?? []) as any);
  }, [carbEvents]);

  if (compact) {
    const palette = getChartPalette(theme);
    const he = language === 'he';
    const unknown = he ? 'אין נתון' : 'No data';
    const noRecord = he ? 'אין רישום סמוך' : 'No nearby record';
    const cells = [
      {
        key: 'basal',
        label: he ? 'בזאל · קצב' : 'Basal · rate',
        color: palette.basal,
        symbol: '┏━',
        value: basalText === '—' ? unknown : basalText,
      },
      {
        key: 'bolus',
        label: he ? 'בולוס · מנה' : 'Bolus · dose',
        color: palette.bolus,
        symbol: '▮',
        value: bolusText === '—' ? noRecord : bolusText,
      },
      {
        key: 'iob',
        label: tr(language, 'home.tooltipActiveInsulin'),
        color: palette.iob,
        symbol: '━',
        value: activeText === '—' ? unknown : activeText,
      },
      {
        key: 'cob',
        label: tr(language, 'home.tooltipCob'),
        color: palette.cob,
        symbol: '━',
        value: cobText === '—' ? unknown : cobText,
      },
    ];
    return (
      <View
        pointerEvents="none"
        style={[
          compactStyles.panel,
          {backgroundColor: palette.surface, borderColor: palette.grid},
        ]}>
        <View style={[compactStyles.header, he && compactStyles.reverse]}>
          <Text style={[compactStyles.time, {color: palette.text}]}>
            {timeText}
          </Text>
          <View style={compactStyles.glucose}>
            <Text style={[compactStyles.glucoseValue, {color: bgColor}]}>
              {bgText === '—' ? unknown : bgText}
            </Text>
            {bgTrendIcon ? (
              <Icon name={bgTrendIcon} size={18} color={bgColor} />
            ) : null}
          </View>
        </View>
        <View style={[compactStyles.grid, he && compactStyles.reverse]}>
          {cells.map(cell => (
            <View key={cell.key} style={compactStyles.cell}>
              <Text
                style={[
                  compactStyles.label,
                  {color: palette.mutedText},
                  he && compactStyles.rtl,
                ]}
                numberOfLines={1}>
                <Text style={{color: cell.color}}>{cell.symbol} </Text>
                {cell.label}
              </Text>
              <Text
                style={[
                  compactStyles.value,
                  {color: palette.text},
                  he ? compactStyles.alignRight : compactStyles.alignLeft,
                  /\d/.test(cell.value) || !he
                    ? compactStyles.ltrFlow
                    : compactStyles.rtlFlow,
                ]}
                numberOfLines={1}>
                {cell.value}
              </Text>
            </View>
          ))}
        </View>
        <Text
          style={[
            compactStyles.context,
            {color: palette.mutedText},
            he && compactStyles.rtl,
          ]}
          numberOfLines={1}>
          {tr(language, 'home.tooltipCarbs')}:{' '}
          {carbsText === '—' ? noRecord : carbsText}
        </Text>
        <Text
          style={[
            compactStyles.context,
            {color: palette.mutedText},
            he && compactStyles.rtl,
          ]}
          numberOfLines={1}>
          {bolusDetailsText
            ? `${he ? 'בולוס' : 'Bolus'}: ${bolusDetailsText}`
            : activeDetailsText ??
              (bgSample
                ? `${
                    he ? 'מדידת סוכר' : 'Glucose reading'
                  }: ${formatDateToLocaleTimeString(bgSample.date)}`
                : he
                ? 'אין מדידת סוכר סמוכה לשעה זו'
                : 'No glucose reading near this time')}
        </Text>
      </View>
    );
  }

  return (
    <Container
      $fullWidth={fullWidth}
      pointerEvents="none"
      style={maxWidthPx != null ? {maxWidth: maxWidthPx} : undefined}>
      <Inner>
        <HeaderRow>
          <HeaderLeft>
            <Icon
              name="clock-outline"
              size={18}
              color={addOpacity(theme.textColor, 0.8)}
            />
            <HeaderText>{timeText}</HeaderText>
          </HeaderLeft>

          <BgPill style={{borderColor: addOpacity(bgColor, 0.35)}}>
            <Icon name="water" size={18} color={bgColor} />
            <BgText style={{color: bgColor}} numberOfLines={1}>
              {bgText}
            </BgText>
            {bgTrendIcon ? (
              <BgTrendWrap>
                <Icon name={bgTrendIcon} size={18} color={bgColor} />
              </BgTrendWrap>
            ) : null}
          </BgPill>
        </HeaderRow>

        <Divider />

        <Grid>
          <Stat>
            <StatLabel>
              <Icon name="needle" size={16} color={theme.colors.insulin} />{' '}
              {tr(language, 'home.tooltipActiveInsulin')}
            </StatLabel>
            <StatValue>{activeText}</StatValue>
            {activeDetailsText ? (
              <StatDetails>{activeDetailsText}</StatDetails>
            ) : null}
          </Stat>

          <Stat>
            <StatLabel>
              <Icon
                name="chart-timeline-variant"
                size={16}
                color={addOpacity(theme.textColor, 0.75)}
              />
              {'  '}
              {tr(language, 'home.tooltipBasal')}
            </StatLabel>
            <StatValue>{basalText}</StatValue>
          </Stat>

          <Stat>
            <StatLabel>
              <Icon name="food-apple" size={16} color={theme.colors.carbs} />{' '}
              {tr(language, 'home.tooltipCob')}
            </StatLabel>
            <StatValue>{cobText}</StatValue>
          </Stat>

          <Stat>
            <StatLabel>
              <Icon
                name="needle"
                size={16}
                color={theme.colors.insulinSecondary}
              />{' '}
              {tr(language, 'home.tooltipBolus')}
            </StatLabel>
            <StatValue>{bolusText}</StatValue>
            {bolusDetailsText ? (
              <StatDetails numberOfLines={2}>
                {tr(language, 'home.tooltipCloseEvents', {
                  text: bolusDetailsText,
                })}
              </StatDetails>
            ) : null}
          </Stat>

          <Stat $fullWidth>
            <StatLabel>
              <Icon
                name="bread-slice-outline"
                size={16}
                color={theme.colors.carbs}
              />{' '}
              {tr(language, 'home.tooltipCarbs')}
            </StatLabel>
            <StatValue>{carbsText}</StatValue>
            {carbDetailsText ? (
              <StatDetails numberOfLines={2}>
                {tr(language, 'home.tooltipCloseEvents', {
                  text: carbDetailsText,
                })}
              </StatDetails>
            ) : null}
          </Stat>
        </Grid>
      </Inner>
    </Container>
  );
};

const Container = styled.View<{$fullWidth: boolean}>`
  ${({$fullWidth}: {$fullWidth: boolean}) => ($fullWidth ? 'width: 100%;' : '')}
`;

const createCompactStyles = (theme: ThemeType) =>
  StyleSheet.create({
    panel: {
      margin: theme.spacing.sm,
      marginBottom: 0,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderRadius: theme.borderRadius,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    time: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.md,
      fontWeight: '700',
      writingDirection: 'ltr',
    },
    glucose: {flexDirection: 'row', alignItems: 'center', gap: 4},
    glucoseValue: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.lg,
      fontWeight: '800',
      writingDirection: 'ltr',
    },
    grid: {flexDirection: 'row', flexWrap: 'wrap', columnGap: '4%'},
    cell: {width: '48%', paddingVertical: 4, minHeight: 46},
    label: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: 18,
    },
    value: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.sm,
      lineHeight: 20,
      fontWeight: '700',
    },
    context: {
      fontFamily: theme.fontFamily,
      fontSize: theme.typography.size.xs,
      lineHeight: 18,
      minHeight: 18,
    },
    reverse: {flexDirection: 'row-reverse'},
    rtl: {textAlign: 'right', writingDirection: 'rtl'},
    alignRight: {textAlign: 'right'},
    alignLeft: {textAlign: 'left'},
    ltrFlow: {writingDirection: 'ltr'},
    rtlFlow: {writingDirection: 'rtl'},
  });

const Inner = styled.View`
  ${({theme}: {theme: ThemeType}) => theme.shadow.small}
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-right: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-bottom: 0px;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.12)};
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px
    ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const HeaderLeft = styled.View`
  flex-direction: row;
  align-items: center;
`;

const HeaderText = styled.Text`
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const BgPill = styled.View`
  flex-direction: row;
  align-items: center;
  border-width: 1px;
  padding-vertical: ${({theme}: {theme: ThemeType}) => theme.spacing.sm - 2}px;
  padding-horizontal: ${({theme}: {theme: ThemeType}) =>
    theme.spacing.md - 2}px;
  border-radius: 999px;
  background-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.white, 0.95)};
`;

const BgText = styled.Text`
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 900;
`;

const BgTrendWrap = styled.View`
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
`;

const Divider = styled.View`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  height: 1px;
  background-color: ${({theme}: {theme: ThemeType}) =>
    addOpacity(theme.textColor, 0.08)};
`;

const Grid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
`;

const Stat = styled.View<{$fullWidth?: boolean}>`
  width: ${({$fullWidth}: {$fullWidth?: boolean}) =>
    $fullWidth ? '100%' : '48%'};
  margin-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
`;

const StatLabel = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
`;

const StatValue = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs / 2}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.lg}px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const StatDetails = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs / 2}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.xs}px;
  font-weight: 600;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.65)};
`;

export default HomeChartsTooltip;
