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
import {QueryClient, QueryClientProvider} from 'react-query';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {
  ADD_FOOD_ITEM_SCREEN,
  ADD_NOTIFICATION_SCREEN,
  ADD_SPORT_ITEM_SCREEN,
  CAMERA_SCREEN,
  EDIT_FOOD_ITEM_SCREEN,
  EDIT_NOTIFICATION_SCREEN,
  EDIT_SPORT_ITEM_SCREEN,
  LOGIN_SCREEN,
  MAIN_TAB_NAVIGATOR,
} from './constants/SCREEN_NAMES';
import MainTabsNavigator from './containers/MainTabsNavigator/MainTabsNavigator';
import AddNotificationScreen from './containers/forms/AddNotificationScreen/AddNotificationScreen';
import EditNotificationScreen from 'app/containers/forms/EditNotificationScreen/EditNotificationScreen';
import {firebase} from '@react-native-firebase/messaging';
import styled, {ThemeProvider} from 'styled-components/native';
import {theme} from 'app/style/theme';
import {Theme} from 'app/types/theme';
import CameraScreen from 'app/components/CameraScreen/CameraScreen';
import AddFoodItemScreen from 'app/containers/forms/Food/AddFoodItem';
import AddSportItem from 'app/containers/forms/Sport/AddSportItem';
import {SportItemsProvider} from 'app/contexts/SportItemsContext';
import EditFoodItemScreen from './containers/forms/Food/EditFoodItemScreen';
import EditSportItem from './containers/forms/Sport/EditSportItem';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

const Stack = createNativeStackNavigator();

const queryClient = new QueryClient();

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
    <GestureHandlerRootView style={{flex: 1}}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={extendedTheme}>
          <StatusBar backgroundColor={theme.backgroundColor} />
          <AppContainer>
            <SafeAreaView style={{flex: 1}}>
              <SafeAreaProvider>
                <SportItemsProvider>
                  <NavigationContainer>
                    <Stack.Navigator screenOptions={{headerShown: false}}>
                      <Stack.Screen
                        name="initScreen"
                        component={AppInitScreen}
                      />
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
                      <Stack.Screen
                        options={{headerShown: true, headerTitle: ''}}
                        name={EDIT_SPORT_ITEM_SCREEN}
                        component={EditSportItem}
                      />
                      <Stack.Screen
                        options={{headerShown: true, headerTitle: ''}}
                        name={EDIT_FOOD_ITEM_SCREEN}
                        component={EditFoodItemScreen}
                      />
                    </Stack.Navigator>
                  </NavigationContainer>
                </SportItemsProvider>
              </SafeAreaProvider>
            </SafeAreaView>
          </AppContainer>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
};

export default App;
