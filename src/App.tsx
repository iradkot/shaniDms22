/**
/**
/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */
import React from 'react';
import ErrorBoundary from 'app/components/ErrorBoundary';
import {LogBox} from 'react-native';
import {StatusBar} from 'react-native';
import Login from './containers/Login';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AppInitScreen from './containers/initScreen';
import {QueryClient, QueryClientProvider} from 'react-query';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
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
import { getApp } from '@react-native-firebase/app';
import { getMessaging } from '@react-native-firebase/messaging';
import messaging from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';
import { registerDeviceToken, unregisterDeviceToken, syncTokenIfNeeded } from 'app/services/rebaseService';
import NotificationModal from 'app/components/NotificationModal';
import {ThemeProvider} from 'styled-components';
import styled from 'styled-components/native';
import {theme} from 'app/style/theme';
import {ThemeType as Theme} from 'app/types/theme';
import CameraScreen from 'app/components/CameraScreen/CameraScreen';
import AddFoodItemScreen from 'app/containers/forms/Food/AddFoodItem';
import AddSportItem from 'app/containers/forms/Sport/AddSportItem';
import {SportItemsProvider} from 'app/contexts/SportItemsContext';
import EditFoodItemScreen from './containers/forms/Food/EditFoodItemScreen';
import EditSportItem from './containers/forms/Sport/EditSportItem';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {TouchProvider} from './components/CgmGraph/contextStores/TouchContext';

// Suppress deprecation warnings from Firebase React Native v21 with Hermes
LogBox.ignoreLogs([
  'This method is deprecated (as well as all React Native Firebase namespaced API)',
]);
const Stack = createNativeStackNavigator();

const queryClient = new QueryClient();

// handle notification press with the modular Messaging API
// https://rnfirebase.io/messaging/usage#handling-messages
const messagingInstance = getMessaging(getApp());
messagingInstance.onNotificationOpenedApp(remoteMessage => {
  console.log(
    'Notification caused app to open from background state, msgID=',
    remoteMessage.messageId,
  );
});

interface AppContainerProps {
  theme: Theme;
}

interface AppContainerProps {
  theme: Theme;
}

const AppContainer = styled.View<AppContainerProps>`
  flex: 1;
  background-color: ${(props: AppContainerProps) => props.theme.backgroundColor};
`;

const App: () => React.ReactElement = () => {
  console.log('App.tsx: Entering App component');
  const extendedTheme = {
    ...theme,
  };
  React.useEffect(() => {
    console.log('App.tsx: App component mounted');
  }, []);  // Register FCM token on start, handle token refresh, and sync daily
  React.useEffect(() => {
    registerDeviceToken();
    
    // Check token sync once per day
    syncTokenIfNeeded();
    
    const unsubscribeRefresh = messaging().onTokenRefresh(async () => {
      console.log('App: FCM token refreshed, updating server...');
      await unregisterDeviceToken();
      await registerDeviceToken();
    });
    return unsubscribeRefresh;
  }, []);

  // Verify and request notification permissions
  React.useEffect(() => {
    const checkPermissions = async () => {
      try {
        // Notifee iOS/Android permission prompt
        const settings = await notifee.requestPermission();
        console.log('App: notifee permission settings:', settings);
        // Request FCM push permission (iOS & Android)
        const authorizationStatus = await messaging().requestPermission();
        console.log('App: FCM permission status:', authorizationStatus);
      } catch (permErr) {
        console.error('App: notification permission error', permErr);
      }
    };
    checkPermissions();
  }, []);
  console.log('App.tsx: App component render');

  console.log('App.tsx: App component rendering');
  // State for in-app notification modal
  const [notifVisible, setNotifVisible] = React.useState(false);
  const [notifTitle, setNotifTitle] = React.useState<string | undefined>();
  const [notifBody, setNotifBody] = React.useState<string | undefined>();
  // if user is not logged in, show login screen else show home screen
  // Subscribe to foreground messages
  React.useEffect(() => {
    const unsubscribeOnMessage = messaging().onMessage(async remoteMessage => {
      console.log('App: foreground message received:', remoteMessage);
      setNotifTitle(remoteMessage.notification?.title);
      setNotifBody(remoteMessage.notification?.body);
      setNotifVisible(true);
    });
    return unsubscribeOnMessage;
  }, []);
  return (
    // TODO - move SafeAreaView style outside
      <GestureHandlerRootView style={{flex: 1}}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={extendedTheme}>
            <ErrorBoundary>
              <TouchProvider>
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
                          component={EditFoodItemScreen}                        />
                      </Stack.Navigator>
                    </NavigationContainer>
                  </SportItemsProvider>
                </SafeAreaProvider>
              </SafeAreaView>
            </AppContainer>
              </TouchProvider>
            </ErrorBoundary>
        </ThemeProvider>
      </QueryClientProvider>
      
      {/* In-app notification modal */}
      <NotificationModal
        visible={notifVisible}
        title={notifTitle}
        body={notifBody}
        onClose={() => setNotifVisible(false)}
      />
    </GestureHandlerRootView>
  );
};

export default App;
