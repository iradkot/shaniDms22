/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React from 'react';
import {SafeAreaView} from 'react-native';
import Login from './containers/Login';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AppInitScreen from './containers/initScreen';
import {
  MAIN_TAB_NAVIGATOR,
  LOGIN_SCREEN,
  ADD_NOTIFICATION_SCREEN,
  EDIT_NOTIFICATION_SCREEN,
} from './constants/SCREEN_NAMES';
import MainTabsNavigator from './containers/MainTabsNavigator/MainTabsNavigator';
import AddNotificationScreen from './containers/AddNotificationScreen/AddNotificationScreen';
import EditNotificationScreen from 'app/containers/EditNotificationScreen/EditNotificationScreen';
import {firebase} from '@react-native-firebase/messaging';

const Stack = createNativeStackNavigator();

// handle notification press with the firebase messaging library
// https://rnfirebase.io/messaging/usage#handling-messages
firebase.messaging().onNotificationOpenedApp(remoteMessage => {
  console.log(
    'Notification caused app to open from background state:',
    remoteMessage.notification,
  );
});

const App: () => JSX.Element = () => {
  // if user is not logged in, show login screen else show home screen
  return (
    // TODO - move SafeAreaView style outside
    <SafeAreaView style={{flex: 1}}>
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
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  );
};

export default App;
