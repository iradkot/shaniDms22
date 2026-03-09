import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

const TIERS = [
  {name: 'Bronze', color: '#b87333', target: 'Base level'},
  {name: 'Silver', color: '#b0bec5', target: 'TIR > 65%, fewer lows'},
  {name: 'Gold', color: '#fbc02d', target: 'TIR > 72%, stable post-meal'},
  {name: 'Platinum', color: '#81d4fa', target: 'TIR > 78%, very low hypo count'},
  {name: 'Diamond', color: '#4fc3f7', target: 'TIR > 85%, minimal hypo/hyper'},
];

const RanksInfoScreen: React.FC = () => {
  const theme = useTheme() as ThemeType;

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.backgroundColor}} contentContainerStyle={{padding: 16, gap: 12}}>
      <Text style={{fontSize: 24, fontWeight: '800', color: theme.textColor}}>Rank System</Text>
      <Text style={{color: addOpacity(theme.textColor, 0.7)}}>
        Rank is based on weekly consistency: TIR, hypo count, hyper count and stability.
      </Text>

      {TIERS.map(t => (
        <View key={t.name} style={{backgroundColor: theme.white, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: addOpacity(t.color, 0.55)}}>
          <Text style={{fontWeight: '800', color: theme.textColor}}>{t.name}</Text>
          <Text style={{color: addOpacity(theme.textColor, 0.8), marginTop: 4}}>{t.target}</Text>
        </View>
      ))}

      <View style={{backgroundColor: theme.white, borderRadius: 12, padding: 12}}>
        <Text style={{fontWeight: '700', color: theme.textColor}}>What moves you up</Text>
        <Text style={{color: theme.textColor, marginTop: 4}}>• Higher weekly TIR</Text>
        <Text style={{color: theme.textColor}}>• Fewer hypo events</Text>
        <Text style={{color: theme.textColor}}>• Fewer severe highs</Text>
        <Text style={{color: theme.textColor}}>• Better post-meal stability</Text>
      </View>
    </ScrollView>
  );
};

export default RanksInfoScreen;
