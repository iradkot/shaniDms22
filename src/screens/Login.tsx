import * as React from 'react';
import {View, Text, ScrollView} from 'react-native';
import {
  GoogleSignin,
  GoogleSigninButton,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {useEffect, useMemo, useState} from 'react';
import GoogleSignIn from '../services/GoogleSignIn';

GoogleSignin.configure();

const Login = () => {
  const [userInfo, setUserInfo] = useState();
  const googleSignIn = useMemo(() => {
    return new GoogleSignIn();
  }, []);
  const getUserInfo = async () => {
    try {
      const gUserInfo = googleSignIn.signIn();
      setUserInfo(gUserInfo);
    } catch (e) {
      console.log('error in Login component', e);
    }
  };
  useEffect(() => {
    // getUserInfo();
  }, []);
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <View>
        <Text onPress={googleSignIn.getTokens}>Get tokens</Text>
        <GoogleSigninButton
          style={{width: 192, height: 48}}
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Dark}
          onPress={getUserInfo}
          disabled={false}
        />
      </View>
    </ScrollView>
  );
};

export default Login;
