// /Trends/components/DataFetchStatus.tsx
import React from 'react';
import { View, Text, ActivityIndicator, Button } from 'react-native';
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
  if (isLoading && !fetchError && !fetchCancelled) {
    return (
      <View style={{ alignItems: "center", marginVertical: 10 }}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>{loadingSteps[loadingStepIndex]}</Text>
        <Text>Fetched {daysFetched} / {rangeDays} days so far...</Text>
        {showLongWaitWarning && (
          <Text style={{ color:'orange', marginTop:5 }}>
            Taking longer than usual. You can wait or cancel.
          </Text>
        )}
        {showMaxWaitReached && (
          <View style={{marginTop:5, alignItems:'center'}}>
            <Text style={{color:'red'}}>
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
      <View style={{ alignItems: "center", marginVertical: 10 }}>
        <Text style={{color:'red'}}>
          Failed to fetch data: {fetchError}. Check your network and try again.
        </Text>
      </View>
    );
  }

  return null;
};
