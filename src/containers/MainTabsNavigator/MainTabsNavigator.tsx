import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Home from './Containers/Home/Home';
import NotificationsManager from './Containers/NotificationsManager/NotificationsManager';
import * as SCREEN_NAMES from 'app/constants/SCREEN_NAMES';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ADIcon from 'react-native-vector-icons/AntDesign';
import {theme} from 'app/style/theme';
import FoodTracker from 'app/containers/MainTabsNavigator/Containers/FoodTracker/FoodTracker';
import {SPORT_TRACKING_TAB_SCREEN} from 'app/constants/SCREEN_NAMES';
import SportTracker from './Containers/SportTracker/SportTracker';

const Tab = createBottomTabNavigator();

const MainTabsNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      initialRouteName={SCREEN_NAMES.HOME_TAB_SCREEN}
      sceneContainerStyle={{
        height: 30,
      }}
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
      }}>
      <Tab.Screen
        name={SCREEN_NAMES.HOME_TAB_SCREEN}
        component={Home}
        options={{
          headerShown: false,
          tabBarIcon: ({color, size}) => (
            <MaterialIcons name="home" color={color} size={size} />
          ),
          tabBarLabel: 'Home',
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
        }}
      />
    </Tab.Navigator>
  );
};

export default MainTabsNavigator;
