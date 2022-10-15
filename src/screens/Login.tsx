import * as React from 'react';
import {View, Text, ScrollView} from 'react-native';
import {
  GoogleSigninButton,
} from '@react-native-google-signin/google-signin';
import {NavigationProp} from '@react-navigation/native';
import {useMemo, useState} from 'react';
import GoogleSignIn, {GoogleSignInResult} from '../services/GoogleSignIn';

const Login: React.FC<{navigation: NavigationProp<any>}> = ({navigation}) => {
  const [userInfo, setUserInfo] = useState<GoogleSignInResult | null>(null);
  const googleSignIn = useMemo(() => {
    return new GoogleSignIn();
  }, []);
  const getUserInfo: () => void = async () => {
    const gUserInfo = await googleSignIn.signIn();
    if (gUserInfo.error) {
      console.log(gUserInfo.error);
    } else {
      setUserInfo(gUserInfo);
      console.log('navigate to home screen');
      navigation.navigate('Home');
    }
  };
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
        <Text>{userInfo?.user?.user.email}</Text>
      </View>
    </ScrollView>
  );
};

export default Login;
