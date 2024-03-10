import GoogleSignIn from '../api/GoogleSignIn';
import React, {useEffect} from 'react';
import {NavigationProp} from '@react-navigation/native';

import {Text, View} from 'react-native';
import {MAIN_TAB_NAVIGATOR, LOGIN_SCREEN} from '../constants/SCREEN_NAMES';

const AppInitScreen: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  // check if user is logged in
  // if logged in, navigate to home screen
  // else navigate to login screen
  const runInit: () => void = async () => {
    const googleSignIn = new GoogleSignIn();
    const isLoggedIn = await googleSignIn.getIsSignedIn();
    if (isLoggedIn) {
      navigation.reset({
        index: 0,
        routes: [{name: MAIN_TAB_NAVIGATOR}],
      });
    } else {
      navigation.reset({
        index: 0,
        routes: [{name: LOGIN_SCREEN}],
      });
    }
  };
  useEffect(() => {
    runInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View>
      <Text>AppInitScreen</Text>
    </View>
  );
};

export default AppInitScreen;
