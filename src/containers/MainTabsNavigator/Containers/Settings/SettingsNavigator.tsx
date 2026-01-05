import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import Settings from './Settings';

export type SettingsStackParamList = {
  SettingsHome: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

const SettingsNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="SettingsHome" component={Settings} />
    </Stack.Navigator>
  );
};

export default SettingsNavigator;
