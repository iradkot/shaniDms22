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

    if (isE2E && !authInstance.currentUser) {
      (authInstance as any)
        .signInAnonymously?.()
        .catch((e: unknown) => {
          console.warn('AppInitScreen: E2E anonymous sign-in failed', e);
          return auth().signInAnonymously();
        })
        .catch((e: unknown) => {
          console.warn('AppInitScreen: E2E fallback anonymous sign-in failed', e);
        });
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
