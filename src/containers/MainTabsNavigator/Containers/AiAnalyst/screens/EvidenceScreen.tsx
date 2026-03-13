import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, BackHandler, Pressable, ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {BgSample} from 'app/types/day_bgs.types';
import AGPSummary from 'app/components/charts/AGPGraph/components/AGPSummary';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import {runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

import {EvidenceRequest} from '../types';
import {Container, Title, Subtle} from '../styled';

interface EvidenceScreenProps {
  request: EvidenceRequest;
  onBack: () => void;
}

const EvidenceScreen: React.FC<EvidenceScreenProps> = ({request, onBack}) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [bgData, setBgData] = useState<BgSample[]>([]);
  const [mealEvidence, setMealEvidence] = useState<any | null>(null);
  const [focusDateIso, setFocusDateIso] = useState<string | null>(request.focusDateIso ?? null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });

    return () => {
      sub.remove();
    };
  }, [onBack]);

  useEffect(() => {
    setFocusDateIso(request.focusDateIso ?? null);
  }, [request.focusDateIso]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      try {
        if (request.kind === 'meal') {
          const mealRes = await runAiAnalystTool('getMealAbsorptionData', {
            daysBack: request.rangeDays,
            mealType: 'all',
          });
          if (!mounted) return;
          if (!mealRes.ok) {
            throw new Error(mealRes.error || 'Failed to load meal evidence');
          }
          setMealEvidence(mealRes.result);
          setBgData([]);
        } else {
          const end = new Date();
          const start = new Date(end.getTime() - request.rangeDays * 24 * 60 * 60 * 1000);
          const rows = await fetchBgDataForDateRangeUncached(start, end, {throwOnError: true});
          if (!mounted) return;
          setBgData(rows ?? []);
          setMealEvidence(null);
        }
      } catch (e: any) {
        if (!mounted) return;
        setErrorText(e?.message ? String(e.message) : 'Failed to load evidence data');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [request.kind, request.rangeDays]);

  const subtitle = useMemo(() => {
    if (request.kind === 'agp') return `AGP for last ${request.rangeDays} days`;
    if (request.kind === 'meal') return `Meal response for last ${request.rangeDays} days`;
    return `Time in Range for last ${request.rangeDays} days`;
  }, [request.kind, request.rangeDays]);

  const normalizedFocusDate = useMemo(() => {
    if (!focusDateIso) return null;
    const d = new Date(focusDateIso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }, [focusDateIso]);

  const isFocusedMeal = (mealDate: string | undefined) => {
    if (!normalizedFocusDate || !mealDate) return false;
    const d = new Date(mealDate);
    if (Number.isNaN(d.getTime())) return false;
    return d.toISOString().slice(0, 10) === normalizedFocusDate;
  };

  return (
    <Container>
      <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={tr(language, 'ai.backToChat')}
          hitSlop={10}
          style={{alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center'}}
        >
          <MaterialIcons name="arrow-back" size={18} color={addOpacity(theme.textColor, 0.8)} />
          <Text style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.8)}}>{tr(language, 'ai.backToChat')}</Text>
        </Pressable>

        <View style={{marginTop: theme.spacing.sm}}>
          <Title>{tr(language, 'ai.evidence')}</Title>
          <Subtle>{subtitle}</Subtle>
          {normalizedFocusDate ? (
            <Text style={{marginTop: 6, color: addOpacity(theme.accentColor, 0.9), fontWeight: '700'}}>
              Focused date: {normalizedFocusDate}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2}}>
        {isLoading ? (
          <View style={{marginTop: theme.spacing.xl, alignItems: 'center'}}>
            <ActivityIndicator />
            <Text style={{marginTop: 10, color: addOpacity(theme.textColor, 0.7)}}>{tr(language, 'ai.loadingData')}</Text>
          </View>
        ) : errorText ? (
          <Text style={{color: theme.belowRangeColor}}>{errorText}</Text>
        ) : request.kind === 'agp' ? (
          <AGPSummary bgData={bgData} showFullScreenButton={false} />
        ) : request.kind === 'meal' ? (
          <View style={{gap: theme.spacing.md}}>
            <Text style={{fontWeight: '700', color: theme.textColor}}>
              Top 3 meals driving the recommendation
            </Text>
            {(mealEvidence?.summary?.topProblemMeals ?? []).slice(0, 3).map((meal: any, idx: number) => (
              <View
                key={`top-${meal?.date || idx}`}
                style={{
                  borderWidth: 1,
                  borderColor: addOpacity('#c62828', 0.5),
                  borderRadius: 12,
                  padding: 10,
                  backgroundColor: addOpacity('#c62828', 0.08),
                }}
              >
                <Text style={{fontWeight: '700', color: theme.textColor}}>
                  {new Date(meal?.date || Date.now()).toLocaleString()} • {meal?.mealType || 'meal'}
                </Text>
                <Text style={{color: addOpacity(theme.textColor, 0.78), marginTop: 4}}>
                  BG at meal: {meal?.bgAtMeal ?? '-'} | Peak: {meal?.peakBg ?? '-'} | Rise: {meal?.riseMgdl ?? '-'} mg/dL
                </Text>
                <Text style={{color: addOpacity(theme.textColor, 0.78), marginTop: 4}}>
                  Why this matters: {meal?.likelyDriver || 'post-meal variability'}
                </Text>
              </View>
            ))}

            <Text style={{fontWeight: '700', color: theme.textColor, marginTop: 4}}>
              Recent meal responses
            </Text>
            {(mealEvidence?.meals ?? []).slice(0, 8).map((meal: any, idx: number) => {
              const rise = typeof meal?.riseMgdl === 'number' ? meal.riseMgdl : null;
              const tirScore = typeof meal?.tirScore === 'number' ? meal.tirScore : null;
              const focused = isFocusedMeal(meal?.date);

              const status: 'good' | 'watch' | 'risk' =
                rise != null && rise <= 45 && (tirScore == null || tirScore >= 75)
                  ? 'good'
                  : rise != null && rise <= 80 && (tirScore == null || tirScore >= 60)
                    ? 'watch'
                    : 'risk';

              const statusColor =
                status === 'good' ? '#2e7d32' : status === 'watch' ? '#f9a825' : '#c62828';
              const statusLabel = status === 'good' ? 'Looks stable' : status === 'watch' ? 'Can improve' : 'Needs attention';

              const improvementHint =
                status === 'good'
                  ? 'Keep this pattern.'
                  : rise != null && rise > 80
                    ? 'Likely carb-ratio or pre-bolus timing issue. Consider a cautious CR/timing adjustment.'
                    : 'Review meal timing and carb entry accuracy for this meal.';

              return (
                <View
                  key={`${meal?.date || idx}`}
                  style={{
                    borderWidth: focused ? 2 : 1,
                    borderColor: focused ? theme.accentColor : addOpacity(statusColor, 0.55),
                    borderRadius: 12,
                    padding: 10,
                    backgroundColor: focused ? addOpacity(theme.accentColor, 0.12) : addOpacity(statusColor, 0.08),
                  }}
                >
                  <Text style={{fontWeight: '700', color: theme.textColor}}>
                    {meal?.mealType || 'meal'} • {meal?.carbsEnteredG ?? '-'}g carbs
                  </Text>
                  <Text style={{color: addOpacity(theme.textColor, 0.72), marginTop: 2}}>
                    {meal?.date ? new Date(meal.date).toLocaleString() : '-'}
                  </Text>
                  <Text style={{color: statusColor, marginTop: 4, fontWeight: '700'}}>
                    {statusLabel}{focused ? ' • Focused' : ''}
                  </Text>
                  <Text style={{color: addOpacity(theme.textColor, 0.78), marginTop: 4}}>
                    BG at meal: {meal?.bgAtMeal ?? '-'} mg/dL | Peak: {meal?.peakBg ?? '-'} mg/dL | Rise: {meal?.riseMgdl ?? '-'} mg/dL
                  </Text>
                  <Text style={{color: addOpacity(theme.textColor, 0.78), marginTop: 2}}>
                    3h in-range score: {meal?.tirScore ?? '-'}%
                  </Text>
                  <Text style={{color: addOpacity(theme.textColor, 0.78), marginTop: 6}}>
                    What to improve: {improvementHint}
                  </Text>
                </View>
              );
            })}
            <Text style={{color: addOpacity(theme.textColor, 0.72)}}>
              Meals analyzed: {mealEvidence?.mealCount ?? 0}
            </Text>
            {mealEvidence?.summary?.evidenceFallback === 'bg_response_only' ? (
              <Text style={{color: addOpacity(theme.textColor, 0.72)}}>
                Note: Absorption (COB) data was partial, so this view is based on glucose meal-response evidence.
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={{gap: theme.spacing.md}}>
            <TimeInRangeRow bgData={bgData} />
            <Text style={{color: addOpacity(theme.textColor, 0.72)}}>
              Based on {bgData.length} glucose readings.
            </Text>
          </View>
        )}
      </ScrollView>
    </Container>
  );
};

export default EvidenceScreen;
