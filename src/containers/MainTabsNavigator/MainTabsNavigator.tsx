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
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

const Tab = createBottomTabNavigator();

const MainTabsNavigator: React.FC = () => {
  const makeTabBarButton =
    (testID: string) => (props: BottomTabBarButtonProps) => (
      <Pressable {...props} testID={testID} accessibilityLabel={testID} />
    );

  return (
    <View testID={E2E_TEST_IDS.tabs.navigator} style={{flex: 1}}>
      <Tab.Navigator
        initialRouteName={SCREEN_NAMES.HOME_TAB_SCREEN}
        // removed contentStyle, let each screen/container handle its own flex
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.backgroundColor,
            height: theme.tabBarHeight,
          },
          tabBarIconStyle: {
            color: theme.textColor,
          },
          tabBarActiveTintColor: theme.accentColor,
        }}
      >
        <Tab.Screen
          name={SCREEN_NAMES.HOME_TAB_SCREEN}
          component={Home}
          options={{
            headerShown: false,
            tabBarIcon: ({color, size}) => (
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
            tabBarIcon: ({color, size}) => (
              <MaterialIcons name="timeline" color={color} size={size} />
            ),
            tabBarLabel: 'Trends',
            tabBarTestID: E2E_TEST_IDS.tabs.trends,
            tabBarButton: makeTabBarButton(E2E_TEST_IDS.tabs.trends),
          }}
        />
        <Tab.Screen
          name={SCREEN_NAMES.Food_Tracking_TAB_SCREEN}
          component={FoodTracker}
          options={{
            tabBarIcon: ({color, size}) => (
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
            tabBarIcon: ({color, size}) => (
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
            tabBarIcon: ({color, size}) => (
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
