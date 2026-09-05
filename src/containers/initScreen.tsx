import {getAuth} from '@react-native-firebase/auth';
import {getApp} from '@react-native-firebase/app';
import React, {useEffect} from 'react';
import {NavigationProp} from '@react-navigation/native';

import {Text, View} from 'react-native';
import {
  PRODUCT_EXPERIENCE_SCREEN,
  LOGIN_SCREEN,
  NIGHTSCOUT_SETUP_SCREEN,
} from '../constants/SCREEN_NAMES';
import {isE2E} from 'app/utils/e2e';
import {hasAnyNightscoutProfile} from 'app/services/nightscoutProfiles';

const AppInitScreen: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  // navigate based on Firebase auth state
  useEffect(() => {
    // E2E runs should not depend on Firebase auth configuration.
    // It exercises the rebuilt product shell first; the preserved legacy
    // scenarios enter their compatibility UI through a real Hub destination.
    if (isE2E) {
      navigation.reset({
        index: 0,
        routes: [{name: PRODUCT_EXPERIENCE_SCREEN}],
      });
      return;
    }

    const authInstance = getAuth(getApp());
    let active = true;
    let authRevision = 0;

    const unsubscribe = authInstance.onAuthStateChanged(user => {
      const revision = ++authRevision;
      (async () => {
        console.log('AppInitScreen: Auth UID=', user?.uid);

        if (!user) {
          if (active && revision === authRevision) {
            navigation.reset({
              index: 0,
              routes: [{name: LOGIN_SCREEN}],
            });
          }
          return;
        }

        const expectedUserId = user.uid;
        const hasProfile = await hasAnyNightscoutProfile(expectedUserId);
        if (
          !active ||
          revision !== authRevision ||
          authInstance.currentUser?.uid !== expectedUserId
        ) {
          return;
        }
        navigation.reset({
          index: 0,
          routes: [
            {
              name: hasProfile
                ? PRODUCT_EXPERIENCE_SCREEN
                : NIGHTSCOUT_SETUP_SCREEN,
            },
          ],
        });
      })().catch(err => {
        if (!active || revision !== authRevision) {
          return;
        }
        console.warn('AppInitScreen: failed deciding initial route', err);
        navigation.reset({
          index: 0,
          routes: [{name: PRODUCT_EXPERIENCE_SCREEN}],
        });
      });
    });
    return () => {
      active = false;
      authRevision += 1;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View>
      <Text>AppInitScreen</Text>
    </View>
  );
};

export default AppInitScreen;
