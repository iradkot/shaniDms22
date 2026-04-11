import React from 'react';
import {Text, View} from 'react-native';
import {addOpacity} from 'app/style/styling.utils';
import type {ThemeType} from 'app/types/theme';

import {useAppTheme} from 'app/hooks/useAppTheme';
type Props = {
  score: number;
};

const ScoreBadge: React.FC<Props> = ({score}) => {
  const theme = useAppTheme();
  const isPerfect = score >= 100;
  const color = isPerfect
    ? theme.accentColor
    : score >= 75
      ? theme.inRangeColor
      : score >= 55
        ? theme.aboveRangeColor
        : theme.belowRangeColor;

  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: addOpacity(color, isPerfect ? 0.22 : 0.18),
      }}
    >
      <Text style={{fontWeight: '900', color}}>{isPerfect ? `${score} ✨` : score}</Text>
    </View>
  );
};

export default React.memo(ScoreBadge);
