import React, {useCallback, useEffect, useRef} from 'react';
import {BackHandler, StyleSheet, View} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import {E2E_TEST_IDS} from '../../../constants/E2E_TEST_IDS';
import {useAppLanguage} from '../../../contexts/AppLanguageContext';
import type {AiSpecialistId} from '../../../modules/ai';
import {AiAnalystModuleView} from '../../../product/ai/AiAnalystModuleView';
import {useLegacyAiAnalystModuleRuntime} from './useLegacyAiAnalystModuleRuntime';

type LegacyAiRoutes = {
  Ai: {
    initialMission?: string | undefined;
    homeRecommendationContext?: string | undefined;
  } | undefined;
};

const legacySpecialist = (
  mission: string | undefined,
): AiSpecialistId | undefined => {
  switch (mission) {
    case 'openChat':
      return 'general-chat';
    case 'hypoDetective':
      return 'hypo-investigation';
    case 'userBehavior':
      return 'behavior-analysis';
    case 'loopSettings':
      return 'loop-advice';
    case 'mealAnalysis':
      return 'meal-analysis';
    default:
      return undefined;
  }
};

/** Legacy route names enter the same recommendation experience as Product. */
const UnifiedAiAnalystScreen = () => {
  const {language} = useAppLanguage();
  const runtime = useLegacyAiAnalystModuleRuntime(language);
  const route = useRoute<RouteProp<LegacyAiRoutes, 'Ai'>>();
  const navigation = useNavigation<NavigationProp<LegacyAiRoutes, 'Ai'>>();
  const consumedLaunch = useRef<string | undefined>(undefined);
  const context = typeof route.params?.homeRecommendationContext === 'string'
    ? route.params.homeRecommendationContext.trim()
    : undefined;
  const mission = typeof route.params?.initialMission === 'string'
    ? route.params.initialMission
    : undefined;

  useEffect(() => {
    if (!context && !mission) {
      consumedLaunch.current = undefined;
      return;
    }
    if (runtime.snapshot.availability !== 'ready' || runtime.snapshot.busy) {
      return;
    }
    const identity = JSON.stringify([mission, context]);
    if (consumedLaunch.current === identity) {
      return;
    }
    consumedLaunch.current = identity;
    const specialist = legacySpecialist(mission);
    navigation.setParams({
      initialMission: undefined,
      homeRecommendationContext: undefined,
    });
    if (context && runtime.startRecommendation) {
      runtime.startRecommendation({
        request: {
          kind: specialist === 'meal-analysis' ? 'meal' : 'now',
          patientNotes: context,
        },
        locale: language,
      }).catch(() => undefined);
      return;
    }
    if (specialist) {
      runtime.start({specialist, locale: language}).catch(() => undefined);
    }
  }, [context, language, mission, navigation, runtime]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (runtime.snapshot.surface.kind === 'history-detail') {
          runtime.openHistory().catch(() => undefined);
          return true;
        }
        if (runtime.snapshot.surface.kind !== 'landing') {
          runtime.openLanding();
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [runtime]),
  );

  return (
    <View style={styles.screen} testID={E2E_TEST_IDS.screens.aiAnalyst}>
      <AiAnalystModuleView locale={language} runtime={runtime} />
    </View>
  );
};

const styles = StyleSheet.create({screen: {flex: 1}});

export default UnifiedAiAnalystScreen;
