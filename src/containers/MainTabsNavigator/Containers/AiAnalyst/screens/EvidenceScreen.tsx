import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {useTheme} from 'styled-components/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {BgSample} from 'app/types/day_bgs.types';
import AGPSummary from 'app/components/charts/AGPGraph/components/AGPSummary';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import {runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import {useActiveAiWorkspaceScope} from 'app/services/aiMemory/useActiveAiWorkspaceScope';
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
  const aiWorkspaceScope = useActiveAiWorkspaceScope();
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [bgData, setBgData] = useState<BgSample[]>([]);
  const [mealEvidence, setMealEvidence] = useState<any | null>(null);
  const [focusDateIso, setFocusDateIso] = useState<string | null>(
    request.focusDateIso ?? null,
  );

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
        if (!aiWorkspaceScope) {
          throw new Error(tr(language, 'ai.failedEvidenceData'));
        }
        if (request.kind === 'meal') {
          const mealRes = await runAiAnalystTool(aiWorkspaceScope, 'getMealAbsorptionData', {
            daysBack: request.rangeDays,
            mealType: 'all',
          });
          if (!mounted) return;
          if (!mealRes.ok) {
            throw new Error(
              mealRes.error || tr(language, 'ai.failedMealEvidence'),
            );
          }
          setMealEvidence(mealRes.result);
          setBgData([]);
        } else {
          const end = new Date();
          const start = new Date(
            end.getTime() - request.rangeDays * 24 * 60 * 60 * 1000,
          );
          const rows = await fetchBgDataForDateRangeUncached(start, end, {
            throwOnError: true,
          });
          if (!mounted) return;
          setBgData(rows ?? []);
          setMealEvidence(null);
        }
      } catch (e: any) {
        if (!mounted) return;
        setErrorText(
          e?.message
            ? String(e.message)
            : tr(language, 'ai.failedEvidenceData'),
        );
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [aiWorkspaceScope, language, request.kind, request.rangeDays]);

  const subtitle = useMemo(() => {
    if (request.kind === 'agp')
      return tr(language, 'ai.agpLastDays', {days: request.rangeDays});
    if (request.kind === 'meal')
      return tr(language, 'ai.mealResponseLastDays', {days: request.rangeDays});
    return tr(language, 'ai.tirLastDays', {days: request.rangeDays});
  }, [language, request.kind, request.rangeDays]);

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

  const mealTypeLabel = (mealType: unknown): string => {
    const normalized =
      typeof mealType === 'string' ? mealType.trim().toLowerCase() : '';
    if (normalized === 'breakfast') return tr(language, 'ai.mealTypeBreakfast');
    if (normalized === 'lunch') return tr(language, 'ai.mealTypeLunch');
    if (normalized === 'dinner') return tr(language, 'ai.mealTypeDinner');
    if (normalized === 'snack') return tr(language, 'ai.mealTypeSnack');
    return normalized || tr(language, 'ai.mealTypeMeal');
  };

  return (
    <Container>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
        }}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={tr(language, 'ai.backToChat')}
          hitSlop={10}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
          }}>
          <MaterialIcons
            name="arrow-back"
            size={18}
            color={addOpacity(theme.textColor, 0.8)}
          />
          <Text
            style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.8)}}>
            {tr(language, 'ai.backToChat')}
          </Text>
        </Pressable>

        <View style={{marginTop: theme.spacing.sm}}>
          <Title>{tr(language, 'ai.evidence')}</Title>
          <Subtle>{subtitle}</Subtle>
          {normalizedFocusDate ? (
            <Text
              style={{
                marginTop: 6,
                color: addOpacity(theme.accentColor, 0.9),
                fontWeight: '700',
              }}>
              {tr(language, 'ai.focusedDate', {date: normalizedFocusDate})}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.xl * 2,
        }}>
        {isLoading ? (
          <View style={{marginTop: theme.spacing.xl, alignItems: 'center'}}>
            <ActivityIndicator />
            <Text
              style={{marginTop: 10, color: addOpacity(theme.textColor, 0.7)}}>
              {tr(language, 'ai.loadingData')}
            </Text>
          </View>
        ) : errorText ? (
          <Text style={{color: theme.belowRangeColor}}>{errorText}</Text>
        ) : request.kind === 'agp' ? (
          <AGPSummary bgData={bgData} showFullScreenButton={false} />
        ) : request.kind === 'meal' ? (
          <View style={{gap: theme.spacing.md}}>
            <Text style={{fontWeight: '700', color: theme.textColor}}>
              {tr(language, 'ai.topMeals')}
            </Text>
            {(mealEvidence?.summary?.topProblemMeals ?? [])
              .slice(0, 3)
              .map((meal: any, idx: number) => (
                <View
                  key={`top-${meal?.date || idx}`}
                  style={{
                    borderWidth: 1,
                    borderColor: addOpacity('#c62828', 0.5),
                    borderRadius: 12,
                    padding: 10,
                    backgroundColor: addOpacity('#c62828', 0.08),
                  }}>
                  <Text style={{fontWeight: '700', color: theme.textColor}}>
                    {new Date(meal?.date || Date.now()).toLocaleString(
                      language === 'he' ? 'he-IL' : 'en-US',
                    )}{' '}
                    • {mealTypeLabel(meal?.mealType)}
                  </Text>
                  <Text
                    style={{
                      color: addOpacity(theme.textColor, 0.78),
                      marginTop: 4,
                    }}>
                    {tr(language, 'ai.mealMetrics', {
                      bg: meal?.bgAtMeal ?? '-',
                      peak: meal?.peakBg ?? '-',
                      rise: meal?.riseMgdl ?? '-',
                    })}
                  </Text>
                  <Text
                    style={{
                      color: addOpacity(theme.textColor, 0.78),
                      marginTop: 4,
                    }}>
                    {tr(language, 'ai.whyThisMatters', {
                      reason:
                        meal?.likelyDriver ||
                        tr(language, 'ai.postMealVariability'),
                    })}
                  </Text>
                </View>
              ))}

            <Text
              style={{fontWeight: '700', color: theme.textColor, marginTop: 4}}>
              {tr(language, 'ai.recentMealResponses')}
            </Text>
            {(mealEvidence?.meals ?? [])
              .slice(0, 8)
              .map((meal: any, idx: number) => {
                const rise =
                  typeof meal?.riseMgdl === 'number' ? meal.riseMgdl : null;
                const tirScore =
                  typeof meal?.tirScore === 'number' ? meal.tirScore : null;
                const focused = isFocusedMeal(meal?.date);

                const status: 'good' | 'watch' | 'risk' =
                  rise != null &&
                  rise <= 45 &&
                  (tirScore == null || tirScore >= 75)
                    ? 'good'
                    : rise != null &&
                      rise <= 80 &&
                      (tirScore == null || tirScore >= 60)
                    ? 'watch'
                    : 'risk';

                const statusColor =
                  status === 'good'
                    ? '#2e7d32'
                    : status === 'watch'
                    ? '#f9a825'
                    : '#c62828';
                const statusLabel =
                  status === 'good'
                    ? tr(language, 'ai.looksStable')
                    : status === 'watch'
                    ? tr(language, 'ai.canImprove')
                    : tr(language, 'ai.needsAttention');

                const improvementHint =
                  status === 'good'
                    ? tr(language, 'ai.keepPattern')
                    : rise != null && rise > 80
                    ? tr(language, 'ai.adjustCrTimingHint')
                    : tr(language, 'ai.reviewMealEntryHint');

                return (
                  <View
                    key={`${meal?.date || idx}`}
                    style={{
                      borderWidth: focused ? 2 : 1,
                      borderColor: focused
                        ? theme.accentColor
                        : addOpacity(statusColor, 0.55),
                      borderRadius: 12,
                      padding: 10,
                      backgroundColor: focused
                        ? addOpacity(theme.accentColor, 0.12)
                        : addOpacity(statusColor, 0.08),
                    }}>
                    <Text style={{fontWeight: '700', color: theme.textColor}}>
                      {tr(language, 'ai.mealCarbs', {
                        meal: mealTypeLabel(meal?.mealType),
                        carbs: meal?.carbsEnteredG ?? '-',
                      })}
                    </Text>
                    <Text
                      style={{
                        color: addOpacity(theme.textColor, 0.72),
                        marginTop: 2,
                      }}>
                      {meal?.date
                        ? new Date(meal.date).toLocaleString(
                            language === 'he' ? 'he-IL' : 'en-US',
                          )
                        : '-'}
                    </Text>
                    <Text
                      style={{
                        color: statusColor,
                        marginTop: 4,
                        fontWeight: '700',
                      }}>
                      {statusLabel}
                      {focused ? ` • ${tr(language, 'ai.focused')}` : ''}
                    </Text>
                    <Text
                      style={{
                        color: addOpacity(theme.textColor, 0.78),
                        marginTop: 4,
                      }}>
                      {tr(language, 'ai.mealMetrics', {
                        bg: meal?.bgAtMeal ?? '-',
                        peak: meal?.peakBg ?? '-',
                        rise: meal?.riseMgdl ?? '-',
                      })}
                    </Text>
                    <Text
                      style={{
                        color: addOpacity(theme.textColor, 0.78),
                        marginTop: 2,
                      }}>
                      {tr(language, 'ai.threeHourTir', {
                        score: meal?.tirScore ?? '-',
                      })}
                    </Text>
                    <Text
                      style={{
                        color: addOpacity(theme.textColor, 0.78),
                        marginTop: 6,
                      }}>
                      {tr(language, 'ai.whatToImprove', {
                        hint: improvementHint,
                      })}
                    </Text>
                  </View>
                );
              })}
            <Text style={{color: addOpacity(theme.textColor, 0.72)}}>
              {tr(language, 'ai.mealsAnalyzed', {
                count: mealEvidence?.mealCount ?? 0,
              })}
            </Text>
            {mealEvidence?.summary?.evidenceFallback === 'bg_response_only' ? (
              <Text style={{color: addOpacity(theme.textColor, 0.72)}}>
                {tr(language, 'ai.absorptionPartialNote')}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={{gap: theme.spacing.md}}>
            <TimeInRangeRow bgData={bgData} />
            <Text style={{color: addOpacity(theme.textColor, 0.72)}}>
              {tr(language, 'ai.basedOnReadings', {count: bgData.length})}
            </Text>
          </View>
        )}
      </ScrollView>
    </Container>
  );
};

export default EvidenceScreen;
