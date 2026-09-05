import * as React from 'react';
import {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {GoogleSigninButton} from '@react-native-google-signin/google-signin';
import {NavigationProp} from '@react-navigation/native';
import GoogleSignIn from '../api/GoogleSignIn';
import {
  PRODUCT_EXPERIENCE_SCREEN,
  NIGHTSCOUT_SETUP_SCREEN,
} from '../constants/SCREEN_NAMES';
import {isE2E} from 'app/utils/e2e';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {hasAnyNightscoutProfile} from 'app/services/nightscoutProfiles';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

const Login: React.FC<{navigation: NavigationProp<any>}> = ({navigation}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const googleSignIn = useMemo(() => new GoogleSignIn(), []);
  const {language, setLanguage} = useAppLanguage();
  const rtl = language === 'he';

  const goToPostLogin = async (firebaseUserId: string) => {
    const hasProfile = await hasAnyNightscoutProfile(firebaseUserId);
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
  };

  const signInE2E = () => {
    if (loading) {
      return;
    }
    // E2E validates the offline-capable Product shell and must not depend on
    // an enabled Firebase authentication provider.
    navigation.reset({
      index: 0,
      routes: [{name: PRODUCT_EXPERIENCE_SCREEN}],
    });
  };
  const getUserInfo = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const result = await googleSignIn.signIn();
      if (result.error) {
        setError(tr(language, 'auth.signInFailed'));
        return;
      }
      const firebaseUserId = result.user?.user.uid?.trim();
      if (!firebaseUserId) {
        setError(tr(language, 'auth.signInFailed'));
        return;
      }
      await goToPostLogin(firebaseUserId);
    } catch {
      setError(tr(language, 'auth.signInFailed'));
    } finally {
      setLoading(false);
    }
  };
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      testID={E2E_TEST_IDS.login.screen}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={styles.screen}>
      <View style={styles.decorativeTop} />
      <View style={[styles.languageRow, rtl && styles.rowReverse]}>
        <Text style={[styles.languageLabel, rtl && styles.rtlText]}>
          {tr(language, 'auth.language')}
        </Text>
        <View style={[styles.languageControl, rtl && styles.rowReverse]}>
          {(['he', 'en'] as const).map(locale => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{checked: language === locale}}
              key={locale}
              onPress={() => setLanguage(locale)}
              style={[
                styles.languageOption,
                language === locale && styles.languageOptionSelected,
              ]}
              testID={`login-language-${locale}`}>
              <Text
                style={[
                  styles.languageOptionText,
                  language === locale && styles.languageOptionTextSelected,
                ]}>
                {locale === 'he' ? 'עברית' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={styles.logoGlyph}>S</Text>
        </View>
        <Text style={[styles.brand, rtl && styles.rtlText]}>
          {tr(language, 'auth.brand')}
        </Text>
        <Text style={[styles.title, rtl && styles.rtlText]}>
          {tr(language, 'auth.title')}
        </Text>
        <Text style={[styles.subtitle, rtl && styles.rtlText]}>
          {tr(language, 'auth.subtitle')}
        </Text>
      </View>

      <View style={styles.signInCard}>
        <Text style={[styles.cardTitle, rtl && styles.rtlText]}>
          {loading
            ? tr(language, 'auth.signingIn')
            : tr(language, 'auth.signIn')}
        </Text>
        <Text style={[styles.hint, rtl && styles.rtlText]}>
          {tr(language, 'auth.signInHint')}
        </Text>
        {loading ? (
          <View style={styles.loadingButton}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : (
          <GoogleSigninButton
            accessibilityLabel={tr(language, 'auth.signIn')}
            color={GoogleSigninButton.Color.Dark}
            disabled={loading}
            onPress={getUserInfo}
            size={GoogleSigninButton.Size.Wide}
            style={styles.googleButton}
            testID={E2E_TEST_IDS.login.googleButton}
          />
        )}

        {error ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, rtl && styles.rtlText]}>
            {error}
          </Text>
        ) : null}

        {isE2E && (
          <Pressable
            testID={E2E_TEST_IDS.login.e2eButton}
            onPress={signInE2E}
            disabled={loading}
            style={[styles.e2eButton, loading && styles.buttonDisabled]}>
            <Text style={styles.e2eButtonText}>
              {tr(language, 'auth.e2eLogin')}
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {backgroundColor: '#F2F7FC'},
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 32,
  },
  decorativeTop: {
    position: 'absolute',
    left: -80,
    right: -80,
    top: -190,
    height: 390,
    borderBottomLeftRadius: 220,
    borderBottomRightRadius: 220,
    backgroundColor: '#DCEEFF',
  },
  languageRow: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  rowReverse: {flexDirection: 'row-reverse'},
  rtlText: {textAlign: 'right'},
  languageLabel: {color: '#52677B', fontSize: 14, fontWeight: '700'},
  languageControl: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  languageOption: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 17,
  },
  languageOptionSelected: {backgroundColor: '#1769AA'},
  languageOptionText: {color: '#52677B', fontSize: 13, fontWeight: '700'},
  languageOptionTextSelected: {color: '#FFFFFF'},
  hero: {width: '100%', maxWidth: 560, alignItems: 'center'},
  logoMark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#1769AA',
    elevation: 4,
    shadowColor: '#1769AA',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  logoGlyph: {color: '#FFFFFF', fontSize: 34, fontWeight: '900'},
  brand: {
    marginTop: 12,
    color: '#1769AA',
    fontSize: 16,
    fontWeight: '800',
  },
  title: {
    marginTop: 14,
    color: '#14283B',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 38,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    color: '#52677B',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  signInCard: {
    width: '100%',
    maxWidth: 480,
    marginTop: 28,
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D7E4EF',
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#244B6C',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  cardTitle: {color: '#14283B', fontSize: 18, fontWeight: '800'},
  hint: {marginTop: 6, color: '#64788A', fontSize: 13, lineHeight: 19},
  googleButton: {width: '100%', height: 52, marginTop: 16},
  loadingButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    marginTop: 16,
    borderRadius: 6,
    backgroundColor: '#1769AA',
  },
  error: {marginTop: 12, color: '#A22B2B', fontSize: 14, lineHeight: 20},
  e2eButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ccc',
    borderRadius: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  e2eButtonText: {color: '#14283B', fontWeight: '800'},
  buttonDisabled: {opacity: 0.6},
});

export default Login;
