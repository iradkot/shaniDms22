// /Trends/components/DateRangeSelector.tsx
import React from 'react';
import { View, Button } from 'react-native';

interface Props {
  onRangeChange: (days: number) => void;
}

export const DateRangeSelector: React.FC<Props> = ({ onRangeChange }) => {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginVertical: 10 }}>
      <Button title="7 Days" onPress={() => onRangeChange(7)} />
      <Button title="14 Days" onPress={() => onRangeChange(14)} />
      <Button title="30 Days" onPress={() => onRangeChange(30)} />
    </View>
  );
};
