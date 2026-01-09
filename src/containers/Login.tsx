import * as React from 'react';
import {useMemo, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {GoogleSigninButton} from '@react-native-google-signin/google-signin';
import {NavigationProp} from '@react-navigation/native';
import GoogleSignIn, {GoogleSignInResult} from '../api/GoogleSignIn';
import {MAIN_TAB_NAVIGATOR, NIGHTSCOUT_SETUP_SCREEN} from '../constants/SCREEN_NAMES';
import auth, {getAuth} from '@react-native-firebase/auth';
import {getApp} from '@react-native-firebase/app';
import {isE2E} from 'app/utils/e2e';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {hasAnyNightscoutProfile} from 'app/services/nightscoutProfiles';

const Login: React.FC<{navigation: NavigationProp<any>}> = ({navigation}) => {
  const [userInfo, setUserInfo] = useState<GoogleSignInResult | null>(null);
  const [loading, setLoading] = useState(false);
  const googleSignIn = useMemo(() => new GoogleSignIn(), []);

  const goToPostLogin = async () => {
    const hasProfile = await hasAnyNightscoutProfile();
    navigation.reset({
      index: 0,
      routes: [{name: hasProfile ? MAIN_TAB_NAVIGATOR : NIGHTSCOUT_SETUP_SCREEN}],
    });
  };

  const signInE2E = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const authInstance = getAuth(getApp());
      if (typeof (authInstance as any).signInAnonymously === 'function') {
        await (authInstance as any).signInAnonymously();
      } else {
        await auth().signInAnonymously();
      }
      navigation.reset({
        index: 0,
        routes: [{name: MAIN_TAB_NAVIGATOR}],
      });
    } catch (err) {
      console.error('E2E sign-in error:', err);
      // In E2E runs we prefer deterministic navigation over tying tests to
      // Firebase auth provider configuration.
      navigation.reset({
        index: 0,
        routes: [{name: MAIN_TAB_NAVIGATOR}],
      });
    } finally {
      setLoading(false);
    }
  };
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
      await goToPostLogin();
    } catch (err) {
      console.error('Unhandled sign-in error:', err);
    } finally {
      setLoading(false);
    }
  };
  return (
    <ScrollView
      testID={E2E_TEST_IDS.login.screen}
      contentInsetAdjustmentBehavior="automatic">
      <View>
        <Text onPress={googleSignIn.getTokens}>Get tokens</Text>
        <GoogleSigninButton
          testID={E2E_TEST_IDS.login.googleButton}
          style={{width: 192, height: 48}}
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Dark}
          onPress={getUserInfo}
          disabled={loading}
        />

        {isE2E && (
          <Pressable
            testID={E2E_TEST_IDS.login.e2eButton}
            onPress={signInE2E}
            disabled={loading}
            style={{
              marginTop: 12,
              paddingVertical: 12,
              paddingHorizontal: 16,
              backgroundColor: '#ccc',
              borderRadius: 8,
              alignSelf: 'flex-start',
              opacity: loading ? 0.6 : 1,
            }}>
            <Text>E2E Login</Text>
          </Pressable>
        )}

        <Text>{userInfo?.user?.user.email}</Text>
      </View>
    </ScrollView>
  );
};

export default Login;
