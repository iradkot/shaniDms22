import auth, {getAuth} from '@react-native-firebase/auth';
import { getApp } from '@react-native-firebase/app';
import React, {useEffect} from 'react';
import {NavigationProp} from '@react-navigation/native';

import {Text, View} from 'react-native';
import {MAIN_TAB_NAVIGATOR, LOGIN_SCREEN} from '../constants/SCREEN_NAMES';
import {isE2E} from 'app/utils/e2e';

const AppInitScreen: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  // navigate based on Firebase auth state
  useEffect(() => {
    const authInstance = getAuth(getApp());

    // E2E runs should not depend on Firebase auth configuration.
    // In release builds, anonymous sign-in can be disabled which would block
    // navigation and cause all Maestro flows to fail.
    if (isE2E) {
      navigation.reset({
        index: 0,
        routes: [{name: MAIN_TAB_NAVIGATOR}],
      });
      return;
    }

    const unsubscribe = authInstance.onAuthStateChanged(user => {
      console.log('AppInitScreen: Auth UID=', user?.uid);
      navigation.reset({
        index: 0,
        routes: [{ name: user ? MAIN_TAB_NAVIGATOR : LOGIN_SCREEN }],
      });
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View>
      <Text>AppInitScreen</Text>
    </View>
  );
};

export default AppInitScreen;
