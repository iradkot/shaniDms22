import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {AI_MEMORY_SCREEN} from 'app/constants/SCREEN_NAMES';
import Settings from './Settings';
import AiMemoryScreen from './AiMemoryScreen';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  AiMemoryScreen: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

const SettingsNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="SettingsHome" component={Settings} />
      <Stack.Screen name={AI_MEMORY_SCREEN as 'AiMemoryScreen'} component={AiMemoryScreen} />
    </Stack.Navigator>
  );
};

export default SettingsNavigator;
