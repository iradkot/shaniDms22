// /Trends/components/DataFetchStatus.tsx
import React from 'react';
import { View, Text, ActivityIndicator, Button } from 'react-native';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import { loadingSteps } from '../Trends.constants';

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
  const theme = useTheme() as ThemeType;

  if (isLoading && !fetchError && !fetchCancelled) {
    return (
      <View style={{ alignItems: 'center', marginVertical: theme.spacing.sm + 2 }}>
        <ActivityIndicator size="large" color={theme.accentColor} />
        <Text style={{color: theme.textColor}}>{loadingSteps[loadingStepIndex]}</Text>
        <Text style={{color: theme.textColor}}>
          Fetched {daysFetched} / {rangeDays} days so far...
        </Text>
        {showLongWaitWarning && (
          <Text
            style={{
              color: theme.aboveRangeColor,
              marginTop: theme.spacing.xs + 1,
            }}>
            Taking longer than usual. You can wait or cancel.
          </Text>
        )}
        {showMaxWaitReached && (
          <View style={{marginTop: theme.spacing.xs + 1, alignItems: 'center'}}>
            <Text style={{color: theme.belowRangeColor}}>
              Very long loading time. Maybe reduce the date range.
            </Text>
          </View>
        )}
        <Button title="Cancel" onPress={cancelFetch} />
      </View>
    );
  }

  if (!isLoading && fetchError) {
    return (
      <View style={{ alignItems: 'center', marginVertical: theme.spacing.sm + 2 }}>
        <Text style={{color: theme.belowRangeColor}}>
          Failed to fetch data: {fetchError}. Check your network and try again.
        </Text>
      </View>
    );
  }

  return null;
};
