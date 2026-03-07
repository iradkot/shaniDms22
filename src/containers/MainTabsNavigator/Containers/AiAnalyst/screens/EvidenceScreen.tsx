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
        const end = new Date();
        const start = new Date(end.getTime() - request.rangeDays * 24 * 60 * 60 * 1000);
        const rows = await fetchBgDataForDateRangeUncached(start, end, {throwOnError: true});
        if (!mounted) return;
        setBgData(rows ?? []);
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
