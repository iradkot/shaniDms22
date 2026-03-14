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
import {LogBox, Platform, Alert} from 'react-native';
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
  FULL_SCREEN_VIEW_SCREEN,
  HYPO_INVESTIGATION_SCREEN,
  DAILY_REVIEW_SCREEN,
  RANKS_INFO_SCREEN,
} from './constants/SCREEN_NAMES';
import MainTabsNavigator from './containers/MainTabsNavigator/MainTabsNavigator';
import {TabsSettingsProvider} from 'app/contexts/TabsSettingsContext';
import {GlucoseSettingsProvider, useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import AddNotificationScreen from './containers/forms/AddNotificationScreen/AddNotificationScreen';
import EditNotificationScreen from 'app/containers/forms/EditNotificationScreen/EditNotificationScreen';
import { getApp } from '@react-native-firebase/app';
import { getMessaging } from '@react-native-firebase/messaging';
import messaging from '@react-native-firebase/messaging';
import notifee, {EventType} from '@notifee/react-native';
import { registerDeviceToken, unregisterDeviceToken, syncTokenIfNeeded } from 'app/services/rebaseService';
import NotificationModal from 'app/components/NotificationModal';
import {useHypoNowMvp} from 'app/hooks/useHypoNowMvp';
import {useDailyBriefNotifications} from 'app/hooks/useDailyBriefNotifications';
import {
  navigateToHypoInvestigation,
  rootNavigationRef,
} from 'app/navigation/rootNavigation';
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
import FullScreenViewScreen from 'app/containers/FullScreen/FullScreenViewScreen';
import HypoInvestigationScreen from 'app/containers/MainTabsNavigator/Containers/Trends/HypoInvestigationScreen';
import DailyReviewScreen from 'app/containers/MainTabsNavigator/Containers/Home/DailyReviewScreen';
import RanksInfoScreen from 'app/containers/MainTabsNavigator/Containers/Home/RanksInfoScreen';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {TouchProvider} from './components/charts/CgmGraph/contextStores/TouchContext';
import {isE2E} from 'app/utils/e2e';
import {NightscoutConfigProvider} from 'app/contexts/NightscoutConfigContext';
import NightscoutSetupScreen from 'app/containers/NightscoutSetupScreen';
import {NIGHTSCOUT_SETUP_SCREEN} from 'app/constants/SCREEN_NAMES';
import {AiSettingsProvider, useAiSettings} from 'app/contexts/AiSettingsContext';
import {
  ProactiveCareSettingsProvider,
  useProactiveCareSettings,
} from 'app/contexts/ProactiveCareSettingsContext';
import {AppLanguageProvider, useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

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

function parseMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function handleNotificationNavigation(initialNotification: {notification?: {data?: Record<string, string>}} | null) {
  const data = initialNotification?.notification?.data;
  if (!data) return;

  if (data.route === HYPO_INVESTIGATION_SCREEN) {
    navigateToHypoInvestigation({
      startMs: parseMs(data.startMs),
      endMs: parseMs(data.endMs),
      lowThreshold: parseMs(data.lowThreshold),
    });
    return;
  }

  if (data.route === DAILY_REVIEW_SCREEN && rootNavigationRef.isReady()) {
    rootNavigationRef.navigate(DAILY_REVIEW_SCREEN as never);
  }
}

const AppInner: () => React.ReactElement = () => {
  console.log('App.tsx: Entering App component');
  const extendedTheme = {
    ...theme,
  };
  React.useEffect(() => {
    console.log('App.tsx: App component mounted');
  }, []);  // Register FCM token on start, handle token refresh, and sync daily
  React.useEffect(() => {
    if (isE2E) {
      return;
    }

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
    if (isE2E) {
      return;
    }

    const checkPermissions = async () => {
      try {
        // Notifee iOS/Android permission prompt
        const settings = await notifee.requestPermission();
        console.log('App: notifee permission settings:', settings);

        // Request FCM push permission (iOS & Android)
        const authorizationStatus = await messaging().requestPermission();
        console.log('App: FCM permission status:', authorizationStatus);

        if (Platform.OS === 'android') {
          const notifSettings: any = await notifee.getNotificationSettings();
          const alarmEnabled = notifSettings?.android?.alarm;
          console.log('App: android alarm setting:', alarmEnabled, notifSettings?.android);

          if (alarmEnabled === 0) {
            Alert.alert(
              tr(language, 'app.enableAlarmPermissionTitle'),
              tr(language, 'app.enableAlarmPermissionBody'),
              [
                {text: tr(language, 'common.later'), style: 'cancel'},
                {
                  text: tr(language, 'common.openSettings'),
                  onPress: () => {
                    notifee.openAlarmPermissionSettings().catch(() => {});
                  },
                },
              ],
            );
          }

          const batteryOptimized = await notifee.isBatteryOptimizationEnabled();
          if (batteryOptimized) {
            console.log('App: battery optimization is enabled for this app');
          }
        }
      } catch (permErr) {
        console.error('App: notification permission error', permErr);
      }
    };
    checkPermissions();
  }, [language]);
  console.log('App.tsx: App component render');

  console.log('App.tsx: App component rendering');
  // State for in-app notification modal
  const [notifVisible, setNotifVisible] = React.useState(false);
  const [notifTitle, setNotifTitle] = React.useState<string | undefined>();
  const [notifBody, setNotifBody] = React.useState<string | undefined>();
  const {settings: proactiveSettings} = useProactiveCareSettings();
  const {settings: glucoseSettings} = useGlucoseSettings();
  const {settings: aiSettings} = useAiSettings();
  const {language} = useAppLanguage();

  useHypoNowMvp({
    enabled: !isE2E && proactiveSettings.enabled && proactiveSettings.events.hypoNow,
  });

  useDailyBriefNotifications({
    enabled: !isE2E && proactiveSettings.enabled,
    config: proactiveSettings.dailyBrief,
    glucose: glucoseSettings,
    ai: aiSettings,
  });

  React.useEffect(() => {
    if (isE2E) return;

    const unsubscribeForeground = notifee.onForegroundEvent(({type, detail}: {type: number; detail: any}) => {
      if (type !== EventType.PRESS) return;
      handleNotificationNavigation({notification: detail.notification});
    });

    notifee
      .getInitialNotification()
      .then((initialNotification: any) => {
        handleNotificationNavigation(initialNotification);
      })
      .catch((err: unknown) => {
        console.warn('App: failed to read initial notifee notification', err);
      });

    return unsubscribeForeground;
  }, []);

  // if user is not logged in, show login screen else show home screen
  // Subscribe to foreground messages
  React.useEffect(() => {
    if (isE2E) {
      return;
    }

    const unsubscribeOnMessage = messaging().onMessage(async remoteMessage => {
      console.log('App: foreground message received:', remoteMessage);
      setNotifTitle(remoteMessage.notification?.title);
      setNotifBody(remoteMessage.notification?.body);
      setNotifVisible(true);
    });
    return unsubscribeOnMessage;
  }, []);
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={extendedTheme}>
            <ErrorBoundary>
              <TouchProvider>
                <StatusBar backgroundColor={theme.backgroundColor} />
                <AppContainer>
                  <SafeAreaView style={{flex: 1}}>
                    <SportItemsProvider>
                      <NightscoutConfigProvider>
                        <TabsSettingsProvider>
                          <GlucoseSettingsProvider>
                            <AiSettingsProvider>
                              <ProactiveCareSettingsProvider>
                                <NavigationContainer ref={rootNavigationRef}>
                              <Stack.Navigator screenOptions={{headerShown: false}}>
                                <Stack.Screen name="initScreen" component={AppInitScreen} />
                                <Stack.Screen name={LOGIN_SCREEN} component={Login} />
                                <Stack.Screen
                                  name={NIGHTSCOUT_SETUP_SCREEN}
                                  component={NightscoutSetupScreen}
                                />
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
                              <Stack.Screen
                                options={{headerShown: false}}
                                name={FULL_SCREEN_VIEW_SCREEN}
                                component={FullScreenViewScreen}
                              />

                              <Stack.Screen
                                options={{
                                  headerShown: false,
                                }}
                                name={DAILY_REVIEW_SCREEN}
                                component={DailyReviewScreen}
                              />

                              <Stack.Screen
                                options={{
                                  headerShown: true,
                                  headerTitle: tr(language, 'nav.rankSystem'),
                                  headerTitleStyle: {fontSize: 16, fontWeight: '700'},
                                }}
                                name={RANKS_INFO_SCREEN}
                                component={RanksInfoScreen}
                              />

                              <Stack.Screen
                                options={{
                                  headerShown: true,
                                  headerTitle: tr(language, 'nav.hypoInvestigation'),
                                  headerTitleStyle: {fontSize: 16, fontWeight: '700'},
                                }}
                                name={HYPO_INVESTIGATION_SCREEN}
                                component={HypoInvestigationScreen}
                              />
                              </Stack.Navigator>
                            </NavigationContainer>
                              </ProactiveCareSettingsProvider>
                            </AiSettingsProvider>
                          </GlucoseSettingsProvider>
                        </TabsSettingsProvider>
                      </NightscoutConfigProvider>
                    </SportItemsProvider>
                  </SafeAreaView>
                </AppContainer>
              </TouchProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>

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

const App: React.FC = () => (
  <AppLanguageProvider>
    <AppInner />
  </AppLanguageProvider>
);

export default App;

