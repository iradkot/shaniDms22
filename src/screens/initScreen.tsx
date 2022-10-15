import GoogleSignIn from '../services/GoogleSignIn';
import React, {useEffect} from 'react';
import {NavigationProp} from '@react-navigation/native';

import {Text, View} from 'react-native';

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
      navigation.navigate('Home');
    } else {
      navigation.navigate('Login');
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
