import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Home from './Containers/Home/Home';
import NotificationsManager from './Containers/NotificationsManager/NotificationsManager';
import {
  HOME_TAB_SCREEN,
  NOTIFICATION_TAB_SCREEN,
} from 'app/constants/SCREEN_NAMES';
import FAIcon from 'react-native-vector-icons/FontAwesome';
import ADIcon from 'react-native-vector-icons/AntDesign';

const Tab = createBottomTabNavigator();

const MainTabsNavigator: React.FC = () => {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name={HOME_TAB_SCREEN}
        component={Home}
        options={{
          headerShown: false,
          tabBarIcon: ({color, size}) => (
            <FAIcon name="home" color={color} size={size} />
          ),
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name={NOTIFICATION_TAB_SCREEN}
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
