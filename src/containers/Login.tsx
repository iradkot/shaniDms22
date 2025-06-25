import * as React from 'react';
import {useMemo, useState} from 'react';
import {ScrollView, Text, View, Button} from 'react-native';
import {NavigationProp} from '@react-navigation/native';
import GoogleSignIn, {GoogleSignInResult} from '../api/GoogleSignIn';
import {MAIN_TAB_NAVIGATOR} from '../constants/SCREEN_NAMES';

const Login: React.FC<{navigation: NavigationProp<any>}> = ({navigation}) => {
  const [userInfo, setUserInfo] = useState<GoogleSignInResult | null>(null);
  const [loading, setLoading] = useState(false);
  const googleSignIn = useMemo(() => new GoogleSignIn(), []);
  const getUserInfo = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await googleSignIn.signIn();
      if (result.error) {
        console.error('Google sign-in error:', result.error);
        return;
      }
      setUserInfo(result);
      navigation.reset({
        index: 0,
        routes: [{name: MAIN_TAB_NAVIGATOR}],
      });
    } catch (err) {
      console.error('Unhandled sign-in error:', err);
    } finally {
      setLoading(false);
    }
  };
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <View>
        <Text onPress={googleSignIn.getTokens}>Get tokens</Text>
        <Button
          title="Sign In with Google"
          onPress={getUserInfo}
          disabled={loading}
        />
        <Text>{userInfo?.user?.user.email}</Text>
      </View>
    </ScrollView>
  );
};

export default Login;
