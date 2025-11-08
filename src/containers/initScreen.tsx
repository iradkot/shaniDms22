import { firebaseApp } from 'app/firebase';
import { getAuth } from 'firebase/auth';
import React, {useEffect} from 'react';
import {NavigationProp} from '@react-navigation/native';

import {Text, View} from 'react-native';
import {MAIN_TAB_NAVIGATOR, LOGIN_SCREEN} from '../constants/SCREEN_NAMES';

const AppInitScreen: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  // navigate based on Firebase auth state
  useEffect(() => {
    const authInstance = getAuth(firebaseApp);
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
