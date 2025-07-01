import React, {Suspense} from 'react';
import {View, Text, ActivityIndicator} from 'react-native';
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

// Lazy load the Trends component to improve initial bundle load time
const Trends = React.lazy(() => import("app/containers/MainTabsNavigator/Containers/Trends"));

// Loading fallback component for Trends
const TrendsLoadingFallback = () => (
  <View style={{
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.backgroundColor
  }}>
    <ActivityIndicator size="large" color={theme.primaryColor} />
    <Text style={{
      marginTop: 16,
      color: theme.textColor,
      fontSize: 16
    }}>
      Loading Trends...
    </Text>
  </View>
);

// Wrapped component with Suspense for lazy loading
const LazyTrends = () => (
  <Suspense fallback={<TrendsLoadingFallback />}>
    <Trends />
  </Suspense>
);

const Tab = createBottomTabNavigator();

const MainTabsNavigator: React.FC = () => {
  console.log('MainTabsNavigator: render');
  return (
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
        }}
      />
      <Tab.Screen
        name="TRENDS"
        component={LazyTrends}
        options={{
          tabBarIcon: ({color, size}) => (
            <MaterialIcons name="timeline" color={color} size={size} />
          ),
          tabBarLabel: 'Trends',
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
