/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React, {useEffect} from 'react';
// import type {Node} from 'react';
import Login from './screens/Login';
import Home from './screens/Home';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AppInitScreen from './screens/initScreen';

const Stack = createNativeStackNavigator();

const App: () => JSX.Element = () => {
  // if user is not logged in, show login screen else show home screen
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="initScreen" component={AppInitScreen} />
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="Home" component={Home} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
