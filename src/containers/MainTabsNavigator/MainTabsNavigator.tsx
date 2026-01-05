import React from 'react';
import {Pressable, View} from 'react-native';
import {
  BottomTabBarButtonProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import Home from './Containers/Home/Home';
import NotificationsManager from './Containers/NotificationsManager/NotificationsManager';
import * as SCREEN_NAMES from 'app/constants/SCREEN_NAMES';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ADIcon from 'react-native-vector-icons/AntDesign';
import {theme} from 'app/style/theme';
import FoodTracker from 'app/containers/MainTabsNavigator/Containers/FoodTracker/FoodTracker';
import SportTracker from './Containers/SportTracker/SportTracker';
import Trends from 'app/containers/MainTabsNavigator/Containers/Trends';
import Oracle from 'app/containers/MainTabsNavigator/Containers/Oracle';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import SettingsNavigator from 'app/containers/MainTabsNavigator/Containers/Settings/SettingsNavigator';
import {useTabsSettings} from 'app/contexts/TabsSettingsContext';

const Tab = createBottomTabNavigator();

const MainTabsNavigator: React.FC = () => {
  const {settings} = useTabsSettings();

  const makeTabBarButton =
    (testID: string) => (props: BottomTabBarButtonProps) => (
      <Pressable
        {...(props as any)}
        testID={testID}
        accessibilityLabel={testID}
      />
    );

  const hiddenTabOptions = {
    tabBarButton: () => null,
    tabBarItemStyle: {display: 'none' as const},
  };

  return (
    <View testID={E2E_TEST_IDS.tabs.navigator} style={{flex: 1}}>
      <Tab.Navigator
        initialRouteName={SCREEN_NAMES.HOME_TAB_SCREEN}
        // removed contentStyle, let each screen/container handle its own flex
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.backgroundColor,
            // Avoid forcing a fixed height: it can clip the label area,
            // especially on iOS where safe-area insets affect the tab bar.
            minHeight: theme.tabBarHeight,
          },
          tabBarIconStyle: {
            color: theme.textColor,
          },
          tabBarActiveTintColor: theme.accentColor,
          tabBarInactiveTintColor: theme.textColor,
        }}
      >
        <Tab.Screen
          name={SCREEN_NAMES.HOME_TAB_SCREEN}
          component={Home}
          options={{
            headerShown: false,
            tabBarIcon: ({color, size}: {color: string; size: number}) => (
              <MaterialIcons name="home" color={color} size={size} />
            ),
            tabBarLabel: 'Home',
            tabBarTestID: E2E_TEST_IDS.tabs.home,
            tabBarButton: makeTabBarButton(E2E_TEST_IDS.tabs.home),
          }}
        />
        <Tab.Screen
          name="TRENDS"
          component={Trends}
          options={{
            tabBarIcon: ({color, size}: {color: string; size: number}) => (
              <MaterialIcons name="timeline" color={color} size={size} />
            ),
            tabBarLabel: 'Trends',
            tabBarTestID: E2E_TEST_IDS.tabs.trends,
            tabBarButton: makeTabBarButton(E2E_TEST_IDS.tabs.trends),
          }}
        />

        <Tab.Screen
          name={SCREEN_NAMES.ORACLE_TAB_SCREEN}
          component={Oracle}
          options={{
            tabBarIcon: ({color, size}: {color: string; size: number}) => (
              <MaterialIcons name="insights" color={color} size={size} />
            ),
            tabBarLabel: 'Oracle',
            tabBarTestID: E2E_TEST_IDS.tabs.oracle,
            tabBarButton: makeTabBarButton(E2E_TEST_IDS.tabs.oracle),
          }}
        />

        <Tab.Screen
          name={SCREEN_NAMES.SETTINGS_TAB_SCREEN}
          component={SettingsNavigator}
          options={{
            tabBarIcon: ({color, size}: {color: string; size: number}) => (
              <MaterialIcons name="settings" color={color} size={size} />
            ),
            tabBarLabel: 'Settings',
            tabBarTestID: E2E_TEST_IDS.tabs.settings,
            tabBarButton: makeTabBarButton(E2E_TEST_IDS.tabs.settings),
          }}
        />

        <Tab.Screen
          name={SCREEN_NAMES.Food_Tracking_TAB_SCREEN}
          component={FoodTracker}
          options={{
            ...(settings.showFoodTracking ? {} : hiddenTabOptions),
            tabBarIcon: ({color, size}: {color: string; size: number}) => (
              <MaterialIcons name="fastfood" color={color} size={size} />
            ),
            tabBarLabel: 'Food Tracking',
            tabBarTestID: E2E_TEST_IDS.tabs.food,
            tabBarButton: makeTabBarButton(E2E_TEST_IDS.tabs.food),
          }}
        />
        <Tab.Screen
          name={SCREEN_NAMES.SPORT_TRACKING_TAB_SCREEN}
          component={SportTracker}
          options={{
            ...(settings.showSportTracking ? {} : hiddenTabOptions),
            tabBarIcon: ({color, size}: {color: string; size: number}) => (
              <MaterialIcons name="directions-run" color={color} size={size} />
            ),
            tabBarLabel: 'Sport Tracking',
            tabBarTestID: E2E_TEST_IDS.tabs.sport,
            tabBarButton: makeTabBarButton(E2E_TEST_IDS.tabs.sport),
          }}
        />
        <Tab.Screen
          name={SCREEN_NAMES.NOTIFICATION_TAB_SCREEN}
          component={NotificationsManager}
          options={{
            ...(settings.showNotifications ? {} : hiddenTabOptions),
            tabBarIcon: ({color, size}: {color: string; size: number}) => (
              <ADIcon name="notification" color={color} size={size} />
            ),
            tabBarLabel: 'Notifications',
            tabBarTestID: E2E_TEST_IDS.tabs.notifications,
            tabBarButton: makeTabBarButton(E2E_TEST_IDS.tabs.notifications),
          }}
        />
      </Tab.Navigator>
    </View>
  );
};

export default MainTabsNavigator;
