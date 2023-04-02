/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React from 'react';
import {SafeAreaView, StatusBar} from 'react-native';
import Login from './containers/Login';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AppInitScreen from './containers/initScreen';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  MAIN_TAB_NAVIGATOR,
  LOGIN_SCREEN,
  ADD_NOTIFICATION_SCREEN,
  EDIT_NOTIFICATION_SCREEN,
  ADD_FOOD_ITEM_SCREEN,
  CAMERA_SCREEN,
  ADD_SPORT_ITEM_SCREEN,
} from './constants/SCREEN_NAMES';
import MainTabsNavigator from './containers/MainTabsNavigator/MainTabsNavigator';
import AddNotificationScreen from './containers/forms/AddNotificationScreen/AddNotificationScreen';
import EditNotificationScreen from 'app/containers/forms/EditNotificationScreen/EditNotificationScreen';
import {firebase} from '@react-native-firebase/messaging';
import styled, {ThemeProvider} from 'styled-components/native';
import {theme} from 'app/style/theme';
import {Theme} from 'app/types/theme';
import CameraScreen from 'app/components/CameraScreen/CameraScreen';
import AddFoodItemScreen from 'app/containers/forms/AddFoodItem/AddFoodItem';
import AddSportItem from 'app/containers/forms/AddSportItem/AddSportItem';

const Stack = createNativeStackNavigator();

// handle notification press with the firebase messaging library
// https://rnfirebase.io/messaging/usage#handling-messages
firebase.messaging().onNotificationOpenedApp(remoteMessage => {
  console.log(
    'Notification caused app to open from background state:',
    remoteMessage.notification,
  );
});

const AppContainer = styled.View<{theme: Theme}>`
  flex: 1;
  background-color: ${props => props.theme.backgroundColor};
`;

const App: () => JSX.Element = () => {
  const extendedTheme = {
    ...theme,
  };

  // if user is not logged in, show login screen else show home screen
  return (
    // TODO - move SafeAreaView style outside
    <ThemeProvider theme={extendedTheme}>
      <StatusBar backgroundColor={theme.backgroundColor} />
      <AppContainer>
        <SafeAreaView style={{flex: 1}}>
          <SafeAreaProvider>
            <NavigationContainer>
              <Stack.Navigator screenOptions={{headerShown: false}}>
                <Stack.Screen name="initScreen" component={AppInitScreen} />
                <Stack.Screen name={LOGIN_SCREEN} component={Login} />
                <Stack.Screen
                  name={MAIN_TAB_NAVIGATOR}
                  component={MainTabsNavigator}
                />
                <Stack.Screen
                  options={{headerShown: true, headerTitle: ''}}
                  name={ADD_NOTIFICATION_SCREEN}
                  component={AddNotificationScreen}
                />
                <Stack.Screen
                  options={{headerShown: true, headerTitle: ''}}
                  name={EDIT_NOTIFICATION_SCREEN}
                  component={EditNotificationScreen}
                />
                <Stack.Screen
                  options={{headerShown: true, headerTitle: ''}}
                  name={ADD_FOOD_ITEM_SCREEN}
                  component={AddFoodItemScreen}
                />
                <Stack.Screen
                  options={{headerShown: true, headerTitle: ''}}
                  name={CAMERA_SCREEN}
                  component={CameraScreen}
                />
                <Stack.Screen
                  options={{headerShown: true, headerTitle: ''}}
                  name={ADD_SPORT_ITEM_SCREEN}
                  component={AddSportItem}
                />
              </Stack.Navigator>
            </NavigationContainer>
          </SafeAreaProvider>
        </SafeAreaView>
      </AppContainer>
    </ThemeProvider>
  );
};

export default App;
