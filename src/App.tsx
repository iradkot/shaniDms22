/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React from 'react';
// import type {Node} from 'react';
import Login from './containers/Login';
import Home from './containers/MainTabsNavigator/Containers/Home/Home';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import AppInitScreen from './containers/initScreen';
import {
  MAIN_TAB_NAVIGATOR,
  LOGIN_SCREEN,
  ADD_NOTIFICATION_SCREEN,
} from './constants/SCREEN_NAMES';
import MainTabsNavigator from './containers/MainTabsNavigator/MainTabsNavigator';
import AddNotificationScreen from './containers/AddNotificationScreen';

const Stack = createNativeStackNavigator();

const App: () => JSX.Element = () => {
  // if user is not logged in, show login screen else show home screen
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        <Stack.Screen name="initScreen" component={AppInitScreen} />
        <Stack.Screen name={LOGIN_SCREEN} component={Login} />
        <Stack.Screen name={MAIN_TAB_NAVIGATOR} component={MainTabsNavigator} />
        <Stack.Screen
          options={{headerShown: true, headerTitle: ''}}
          name={ADD_NOTIFICATION_SCREEN}
          component={AddNotificationScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;