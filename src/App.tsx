/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React from 'react';
// import type {Node} from 'react';
import {ScrollView, View} from 'react-native';
import Login from './screens/Login';
import {NavigationContainer} from '@react-navigation/native';

const App: () => JSX.Element = () => {
  // const isDarkMode = useColorScheme() === "dark";

  return (
    <NavigationContainer>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View>
          <Login />
        </View>
      </ScrollView>
    </NavigationContainer>
  );
};

export default App;
