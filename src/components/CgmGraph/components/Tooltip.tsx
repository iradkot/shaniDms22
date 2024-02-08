// Tooltip.tsx
import React from 'react';
import {Text, View} from 'react-native';

interface TooltipProps {
  x: number;
  y: number;
  value: string; // or any appropriate type
}

const Tooltip: React.FC<TooltipProps> = ({x, y, value}) => {
  return (
    <View style={{position: 'absolute', left: x, top: y}}>
      <Text>{value}</Text>
    </View>
  );
};

export default Tooltip;
