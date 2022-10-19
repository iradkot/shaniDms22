import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Home from './Containers/Home/Home';
import {Settings} from 'react-native';
import NotificationsManager from './Containers/NotificationsManager/NotificationsManager';
import {
  HOME_TAB_SCREEN,
  NOTIFICATION_TAB_SCREEN,
} from '../../constants/SCREEN_NAMES';

const Tab = createBottomTabNavigator();

const MainTabsNavigator: React.FC = () => {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name={HOME_TAB_SCREEN}
        component={Home}
        // remove header from the screen
        options={{headerShown: false}}
      />
      <Tab.Screen
        name={NOTIFICATION_TAB_SCREEN}
        component={NotificationsManager}
      />
    </Tab.Navigator>
  );
};

export default MainTabsNavigator;
