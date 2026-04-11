import {useAppTheme} from 'app/hooks/useAppTheme';
// /Trends/components/DataFetchStatus.tsx
import React from 'react';
import { View, Text, ActivityIndicator, Button } from 'react-native';

import {ThemeType} from 'app/types/theme';
import { loadingSteps } from '../Trends.constants';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

interface Props {
  isLoading: boolean;
  fetchError: string | null;
  daysFetched: number;
  rangeDays: number;
  loadingStepIndex: number;
  fetchCancelled: boolean;
  cancelFetch: () => void;
  showLongWaitWarning: boolean;
  showMaxWaitReached: boolean;
}

export const DataFetchStatus: React.FC<Props> = ({
                                                   isLoading,
                                                   fetchError,
                                                   daysFetched,
                                                   rangeDays,
                                                   loadingStepIndex,
                                                   fetchCancelled,
                                                   cancelFetch,
                                                   showLongWaitWarning,
                                                   showMaxWaitReached,
                                                 }) => {
  const theme = useAppTheme();
  const {language} = useAppLanguage();

  if (isLoading && !fetchError && !fetchCancelled) {
    return (
      <View style={{ alignItems: 'center', marginVertical: theme.spacing.sm + 2 }}>
        <ActivityIndicator size="large" color={theme.accentColor} />
        <Text style={{color: theme.textColor}}>{loadingSteps[loadingStepIndex]}</Text>
        <Text style={{color: theme.textColor}}>
          {tr(language, 'trends.fetchedSoFar', {daysFetched, rangeDays})}
        </Text>
        {showLongWaitWarning && (
          <Text
            style={{
              color: theme.aboveRangeColor,
              marginTop: theme.spacing.xs + 1,
            }}>
            {tr(language, 'trends.takingLonger')}
          </Text>
        )}
        {showMaxWaitReached && (
          <View style={{marginTop: theme.spacing.xs + 1, alignItems: 'center'}}>
            <Text style={{color: theme.belowRangeColor}}>
              {tr(language, 'trends.veryLongLoading')}
            </Text>
          </View>
        )}
        <Button title={tr(language, 'trends.cancel')} onPress={cancelFetch} />
      </View>
    );
  }

  if (!isLoading && fetchError) {
    return (
      <View style={{ alignItems: 'center', marginVertical: theme.spacing.sm + 2 }}>
        <Text style={{color: theme.belowRangeColor}}>
          {tr(language, 'trends.failedFetch', {error: fetchError || ''})}
        </Text>
      </View>
    );
  }

  return null;
};
