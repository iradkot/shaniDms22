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

import {EvidenceRequest} from '../types';
import {Container, Title, Subtle} from '../styled';

interface EvidenceScreenProps {
  request: EvidenceRequest;
  onBack: () => void;
}

const EvidenceScreen: React.FC<EvidenceScreenProps> = ({request, onBack}) => {
  const theme = useTheme() as ThemeType;
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [bgData, setBgData] = useState<BgSample[]>([]);
  const [mealEvidence, setMealEvidence] = useState<any | null>(null);

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

  return (
    <Container>
      <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to chat"
          hitSlop={10}
          style={{alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center'}}
        >
          <MaterialIcons name="arrow-back" size={18} color={addOpacity(theme.textColor, 0.8)} />
          <Text style={{marginLeft: 6, color: addOpacity(theme.textColor, 0.8)}}>Back to chat</Text>
        </Pressable>

        <View style={{marginTop: theme.spacing.sm}}>
          <Title>Evidence</Title>
          <Subtle>{subtitle}</Subtle>
        </View>
      </View>

      <ScrollView contentContainerStyle={{padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2}}>
        {isLoading ? (
          <View style={{marginTop: theme.spacing.xl, alignItems: 'center'}}>
            <ActivityIndicator />
            <Text style={{marginTop: 10, color: addOpacity(theme.textColor, 0.7)}}>Loading data…</Text>
          </View>
        ) : errorText ? (
          <Text style={{color: theme.belowRangeColor}}>{errorText}</Text>
        ) : request.kind === 'agp' ? (
          <AGPSummary bgData={bgData} showFullScreenButton={false} />
        ) : request.kind === 'meal' ? (
          <View style={{gap: theme.spacing.md}}>
            <Text style={{fontWeight: '700', color: theme.textColor}}>
              Recent meal responses
            </Text>
            {(mealEvidence?.meals ?? []).slice(0, 8).map((meal: any, idx: number) => (
              <View
                key={`${meal?.date || idx}`}
                style={{
                  borderWidth: 1,
                  borderColor: addOpacity(theme.borderColor, 0.8),
                  borderRadius: 12,
                  padding: 10,
                  backgroundColor: theme.white,
                }}
              >
                <Text style={{fontWeight: '700', color: theme.textColor}}>
                  {meal?.mealType || 'meal'} • {meal?.carbsEnteredG ?? '-'}g carbs
                </Text>
                <Text style={{color: addOpacity(theme.textColor, 0.75), marginTop: 4}}>
                  BG at meal: {meal?.bgAtMeal ?? '-'} mg/dL | Peak: {meal?.peakBg ?? '-'} mg/dL | Rise: {meal?.riseMgdl ?? '-'} mg/dL
                </Text>
                <Text style={{color: addOpacity(theme.textColor, 0.75), marginTop: 2}}>
                  3h in-range score: {meal?.tirScore ?? '-'}%
                </Text>
              </View>
            ))}
            <Text style={{color: addOpacity(theme.textColor, 0.72)}}>
              Meals analyzed: {mealEvidence?.mealCount ?? 0}
            </Text>
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
