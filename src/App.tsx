/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */
import React from 'react';
import ErrorBoundary from 'app/components/ErrorBoundary';
import {Alert, Platform, StatusBar, StyleSheet} from 'react-native';
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
  LEGACY_TAB_NAVIGATOR,
  PRODUCT_EXPERIENCE_SCREEN,
  FULL_SCREEN_VIEW_SCREEN,
  HYPO_INVESTIGATION_SCREEN,
  DAILY_REVIEW_SCREEN,
  RANKS_INFO_SCREEN,
  LOOP_ADJUSTMENT_ASSIST_SCREEN,
} from './constants/SCREEN_NAMES';
import ProductExperienceScreen from './containers/ProductExperienceScreen';
import {TabsSettingsProvider} from 'app/contexts/TabsSettingsContext';
import {
  GlucoseSettingsProvider,
  useGlucoseSettings,
} from 'app/contexts/GlucoseSettingsContext';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import notifee, {EventType} from '@notifee/react-native';
import {
  registerDeviceToken,
  unregisterDeviceToken,
  syncTokenIfNeeded,
} from 'app/services/rebaseService';
import NotificationModal from 'app/components/NotificationModal';
import {useHypoNowMvp} from 'app/hooks/useHypoNowMvp';
import {useDailyBriefNotifications} from 'app/hooks/useDailyBriefNotifications';
import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {useAndroidGlucoseLiveSurface} from 'app/hooks/useAndroidGlucoseLiveSurface';
import {handleSnoozeAction} from 'app/services/notifications/snoozeStore';
import {
  navigateToHypoInvestigation,
  navigateToProductUpdateCenter,
  rootNavigationRef,
} from 'app/navigation/rootNavigation';
import {ThemeProvider} from 'styled-components/native';
import styled from 'styled-components/native';
import {
  ThemeSettingsProvider,
  useThemeSettings,
} from 'app/contexts/ThemeSettingsContext';
import {ThemeType as Theme} from 'app/types/theme';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {TouchProvider} from './components/charts/CgmGraph/contextStores/TouchContext';
import {isE2E} from 'app/utils/e2e';
import {NightscoutConfigProvider} from 'app/contexts/NightscoutConfigContext';
import NightscoutSetupScreen from 'app/containers/NightscoutSetupScreen';
import {NIGHTSCOUT_SETUP_SCREEN} from 'app/constants/SCREEN_NAMES';
import {
  AiSettingsProvider,
  useAiSettings,
} from 'app/contexts/AiSettingsContext';
import {
  ProactiveCareSettingsProvider,
  useProactiveCareSettings,
} from 'app/contexts/ProactiveCareSettingsContext';
import {
  AppLanguageProvider,
  useAppLanguage,
} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';
import {LatestNightscoutSnapshotStateProvider} from 'app/platform/native/product';
import {clearNightscoutInstance} from 'app/api/shaniNightscoutInstances';
import {useActiveAiWorkspaceScope} from 'app/services/aiMemory/useActiveAiWorkspaceScope';
import {
  readNotificationData,
  readString,
} from 'app/services/notifications/notificationNavigationPayload';

const Stack = createNativeStackNavigator();

const queryClient = new QueryClient();

function getFullScreenOrientation(route: any) {
  const mode = route?.params?.mode;
  return mode === 'cgmGraph' || mode === 'stackedCharts' || mode === 'agpGraph'
    ? 'landscape'
    : 'default';
}

// handle notification press with the modular Messaging API
// https://rnfirebase.io/messaging/usage#handling-messages
const messagingInstance = getMessaging(getApp());

/**
 * The legacy sport tracker still owns its original Firebase-backed context.
 * Keep that eager fetch behind the legacy route so the new Hub can start
 * without loading sport data that it does not render.
 */
const LegacyTabsWithSportItems: React.FC = () => {
  const {SportItemsProvider} = require('./contexts/SportItemsContext');
  const MainTabsNavigator =
    require('./containers/MainTabsNavigator/MainTabsNavigator').default;
  return (
    <SportItemsProvider>
      <MainTabsNavigator />
    </SportItemsProvider>
  );
};

interface AppContainerProps {
  theme: Theme;
}

const AppContainer = styled.View<AppContainerProps>`
  flex: 1;
  background-color: ${(props: AppContainerProps) =>
    props.theme.backgroundColor};
`;

function parseMs(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface NotifeeNotificationEvent {
  type: number;
  detail: {
    pressAction?: {id?: string};
    notification?: {data?: Record<string, unknown>};
  };
}

function handleNotificationNavigation(initialNotification: unknown) {
  const data = readNotificationData(initialNotification);
  if (!data) {
    return;
  }

  if (data.source === 'rule_based') {
    navigateToProductUpdateCenter(data.occurrenceId);
    return;
  }

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
  const {activeTheme} = useThemeSettings();
  const {language} = useAppLanguage();
  // State for the in-app notification modal.
  const [notifVisible, setNotifVisible] = React.useState(false);
  const [notifTitle, setNotifTitle] = React.useState<string | undefined>();
  const [notifBody, setNotifBody] = React.useState<string | undefined>();
  const [firebaseSessionUserId, setFirebaseSessionUserId] = React.useState<
    string | null
  >(() =>
    isE2E ? 'e2e-product-user' : getAuth(getApp()).currentUser?.uid ?? null,
  );
  const sessionActive = isE2E || firebaseSessionUserId !== null;

  React.useEffect(() => {
    if (isE2E) {
      return;
    }
    return getAuth(getApp()).onAuthStateChanged(user => {
      setFirebaseSessionUserId(user?.uid ?? null);
    });
  }, []);

  const resetSignedOutSession = React.useCallback(() => {
    queryClient.clear();
    clearNightscoutInstance();
    setNotifVisible(false);
    setNotifTitle(undefined);
    setNotifBody(undefined);
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.resetRoot({
        index: 0,
        routes: [{name: LOGIN_SCREEN}],
      });
    }
  }, []);

  React.useEffect(() => {
    if (!sessionActive) {
      resetSignedOutSession();
    }
  }, [resetSignedOutSession, sessionActive]);
  React.useEffect(() => {
    console.log('App.tsx: App component mounted');
  }, []); // Register FCM token on start, handle token refresh, and sync daily
  React.useEffect(() => {
    if (isE2E || !sessionActive) {
      return;
    }

    registerDeviceToken();

    // Check token sync once per day
    syncTokenIfNeeded();

    const unsubscribeRefresh = onTokenRefresh(messagingInstance, async () => {
      console.log('App: FCM token refreshed, updating server...');
      await unregisterDeviceToken();
      await registerDeviceToken();
    });
    return unsubscribeRefresh;
  }, [sessionActive]);

  // Verify and request notification permissions
  React.useEffect(() => {
    if (isE2E) {
      return;
    }

    const checkPermissions = async () => {
      try {
        // Notifee iOS/Android permission prompt
        const settings = await notifee.requestPermission();
        console.log(
          'App: notifee permission request completed',
          settings.authorizationStatus,
        );

        // Request FCM push permission (iOS & Android)
        const authorizationStatus = await requestPermission(messagingInstance);
        console.log('App: FCM permission status:', authorizationStatus);

        if (Platform.OS === 'android') {
          const notifSettings: any = await notifee.getNotificationSettings();
          const alarmEnabled = notifSettings?.android?.alarm;
          console.log('App: android alarm setting:', alarmEnabled);

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
  const {settings: proactiveSettings} = useProactiveCareSettings();
  const {settings: glucoseSettings} = useGlucoseSettings();
  const {settings: aiSettings} = useAiSettings();
  const activeWorkspaceScope = useActiveAiWorkspaceScope();
  const proactiveWorkspaceId = activeWorkspaceScope?.workspaceId;

  useHypoNowMvp({
    enabled:
      !isE2E &&
      sessionActive &&
      proactiveWorkspaceId !== undefined &&
      proactiveSettings.enabled &&
      proactiveSettings.events.hypoNow,
    ...(proactiveWorkspaceId === undefined
      ? {}
      : {scopeId: proactiveWorkspaceId}),
  });

  useDailyBriefNotifications({
    enabled: !isE2E && sessionActive && proactiveSettings.enabled,
    ...(proactiveWorkspaceId === undefined
      ? {}
      : {scopeId: proactiveWorkspaceId}),
    config: proactiveSettings.dailyBrief,
    glucose: glucoseSettings,
    ai: aiSettings,
  });

  const latestNightscoutSnapshotState = useLatestNightscoutSnapshot({
    pollingEnabled: !isE2E && sessionActive,
  });
  const {snapshot: liveGlucoseSnapshot} = latestNightscoutSnapshotState;
  useAndroidGlucoseLiveSurface(liveGlucoseSnapshot ?? null, {
    low: glucoseSettings.hypo,
    high: glucoseSettings.hyper,
  });

  React.useEffect(() => {
    if (isE2E || !sessionActive) {
      return;
    }

    const unsubscribeMessagingPress = onNotificationOpenedApp(
      messagingInstance,
      remoteMessage => handleNotificationNavigation(remoteMessage),
    );
    const unsubscribeForeground = notifee.onForegroundEvent(
      async ({type, detail}: NotifeeNotificationEvent) => {
        if (type === EventType.ACTION_PRESS) {
          const consumed = await handleSnoozeAction(
            detail?.pressAction?.id,
            readString(detail?.notification?.data?.ruleId),
            readString(detail?.notification?.data?.workspaceScopeId),
          );
          if (consumed) {
            return;
          }
        }

        if (type !== EventType.PRESS) {
          return;
        }
        handleNotificationNavigation({notification: detail.notification});
      },
    );

    notifee
      .getInitialNotification()
      .then((initialNotification: unknown) => {
        handleNotificationNavigation(initialNotification);
      })
      .catch((err: unknown) => {
        console.warn('App: failed to read initial notifee notification', err);
      });

    return () => {
      unsubscribeMessagingPress();
      unsubscribeForeground();
    };
  }, [sessionActive]);

  // if user is not logged in, show login screen else show home screen
  // Subscribe to foreground messages
  React.useEffect(() => {
    if (isE2E || !sessionActive) {
      return;
    }

    const unsubscribeOnMessage = onMessage(
      messagingInstance,
      async remoteMessage => {
        console.log('App: foreground message received');
        setNotifTitle(remoteMessage.notification?.title);
        setNotifBody(remoteMessage.notification?.body);
        setNotifVisible(true);
      },
    );
    return unsubscribeOnMessage;
  }, [sessionActive]);
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={activeTheme}>
            <ErrorBoundary>
              <TouchProvider>
                <StatusBar backgroundColor={activeTheme.backgroundColor} />
                <AppContainer>
                  <SafeAreaView style={styles.flex}>
                    <LatestNightscoutSnapshotStateProvider
                      value={latestNightscoutSnapshotState}>
                      <NavigationContainer
                        onReady={() => {
                          if (!sessionActive) {
                            resetSignedOutSession();
                          }
                        }}
                        ref={rootNavigationRef}>
                        <Stack.Navigator screenOptions={{headerShown: false}}>
                          <Stack.Screen
                            name="initScreen"
                            component={AppInitScreen}
                          />
                          <Stack.Screen name={LOGIN_SCREEN} component={Login} />
                          <Stack.Screen
                            name={NIGHTSCOUT_SETUP_SCREEN}
                            component={NightscoutSetupScreen}
                          />
                          <Stack.Screen
                            name={PRODUCT_EXPERIENCE_SCREEN}
                            component={ProductExperienceScreen}
                          />
                          <Stack.Screen
                            name={LEGACY_TAB_NAVIGATOR}
                            component={LegacyTabsWithSportItems}
                          />
                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle: '',
                            }}
                            name={ADD_NOTIFICATION_SCREEN}
                            getComponent={() =>
                              require('./containers/forms/AddNotificationScreen/AddNotificationScreen').default
                            }
                          />
                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle: '',
                            }}
                            name={EDIT_NOTIFICATION_SCREEN}
                            getComponent={() =>
                              require('./containers/forms/EditNotificationScreen/EditNotificationScreen').default
                            }
                          />
                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle: '',
                            }}
                            name={ADD_FOOD_ITEM_SCREEN}
                            getComponent={() =>
                              require('./containers/forms/Food/AddFoodItem').default
                            }
                          />
                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle: '',
                            }}
                            name={CAMERA_SCREEN}
                            getComponent={() =>
                              require('./components/CameraScreen/CameraScreen').default
                            }
                          />
                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle: '',
                            }}
                            name={ADD_SPORT_ITEM_SCREEN}
                            getComponent={() =>
                              require('./containers/forms/Sport/AddSportItem').default
                            }
                          />
                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle: '',
                            }}
                            name={EDIT_SPORT_ITEM_SCREEN}
                            getComponent={() =>
                              require('./containers/forms/Sport/EditSportItem').default
                            }
                          />
                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle: '',
                            }}
                            name={EDIT_FOOD_ITEM_SCREEN}
                            getComponent={() =>
                              require('./containers/forms/Food/EditFoodItemScreen').default
                            }
                          />
                          <Stack.Screen
                            options={({route}: any) => ({
                              headerShown: false,
                              orientation: getFullScreenOrientation(route),
                            })}
                            name={FULL_SCREEN_VIEW_SCREEN}
                            getComponent={() =>
                              require('./containers/FullScreen/FullScreenViewScreen').default
                            }
                          />

                          <Stack.Screen
                            options={{
                              headerShown: false,
                            }}
                            name={DAILY_REVIEW_SCREEN}
                            getComponent={() =>
                              require('./containers/MainTabsNavigator/Containers/Home/DailyReviewScreen').default
                            }
                          />

                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle: tr(language, 'nav.rankSystem'),
                              headerTitleStyle: {
                                fontSize: 16,
                                fontWeight: '700',
                              },
                            }}
                            name={RANKS_INFO_SCREEN}
                            getComponent={() =>
                              require('./containers/MainTabsNavigator/Containers/Home/RanksInfoScreen').default
                            }
                          />

                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle:
                                language === 'he'
                                  ? 'סייע התאמת לופ'
                                  : 'Loop Tuning Assist',
                              headerTitleStyle: {
                                fontSize: 16,
                                fontWeight: '700',
                              },
                            }}
                            name={LOOP_ADJUSTMENT_ASSIST_SCREEN}
                            getComponent={() =>
                              require('./containers/MainTabsNavigator/Containers/Home/LoopAdjustmentAssistScreen').default
                            }
                          />

                          <Stack.Screen
                            options={{
                              headerShown: true,
                              headerTitle: tr(
                                language,
                                'nav.hypoInvestigation',
                              ),
                              headerTitleStyle: {
                                fontSize: 16,
                                fontWeight: '700',
                              },
                            }}
                            name={HYPO_INVESTIGATION_SCREEN}
                            getComponent={() =>
                              require('./containers/MainTabsNavigator/Containers/Trends/HypoInvestigationScreen').default
                            }
                          />
                        </Stack.Navigator>
                      </NavigationContainer>
                    </LatestNightscoutSnapshotStateProvider>
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

const styles = StyleSheet.create({flex: {flex: 1}});

const AppAfterLanguageLoaded: React.FC = () => {
  const {isLoaded} = useAppLanguage();

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeSettingsProvider>
      <NightscoutConfigProvider>
        <TabsSettingsProvider>
          <GlucoseSettingsProvider>
            <AiSettingsProvider>
              <ProactiveCareSettingsProvider>
                <AppInner />
              </ProactiveCareSettingsProvider>
            </AiSettingsProvider>
          </GlucoseSettingsProvider>
        </TabsSettingsProvider>
      </NightscoutConfigProvider>
    </ThemeSettingsProvider>
  );
};

const App: React.FC = () => (
  <AppLanguageProvider>
    <AppAfterLanguageLoaded />
  </AppLanguageProvider>
);

export default App;
