import React from 'react';
import {Text, View} from 'react-native';
import {addOpacity} from 'app/style/styling.utils';

type Props = {
  score: number;
};

const ScoreBadge: React.FC<Props> = ({score}) => {
  const color = score >= 75 ? '#2e7d32' : score >= 55 ? '#f9a825' : '#c62828';

  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: addOpacity(color, 0.18),
      }}
    >
      <Text style={{fontWeight: '900', color}}>{score}</Text>
    </View>
  );
};

export default React.memo(ScoreBadge);
