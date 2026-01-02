// Jest setup for React Native native-module shims used by unit tests.

require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
global.__reanimatedWorkletInit = () => {};

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');
jest.mock('react-native-drop-shadow', () => {
  const React = require('react');
  return ({children}) => React.createElement(React.Fragment, null, children);
});

jest.mock('d3', () => ({
  interpolateRgb: () => () => '#000000',
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    SafeAreaProvider: ({children}) => React.createElement(React.Fragment, null, children),
    SafeAreaView: View,
    useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
  };
});

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContainer: ({children}) => React.createElement(React.Fragment, null, children),
    useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn()}),
    useRoute: () => ({params: {}}),
  };
});

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({children}) => React.createElement(React.Fragment, null, children),
      Screen: ({children}) => React.createElement(React.Fragment, null, children),
    }),
  };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({children}) => React.createElement(React.Fragment, null, children),
      Screen: ({children}) => React.createElement(React.Fragment, null, children),
    }),
  };
});

jest.mock('@react-native-google-signin/google-signin', () => {
  return {
    GoogleSigninButton: 'GoogleSigninButton',
    statusCodes: {
      SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
      IN_PROGRESS: 'IN_PROGRESS',
      PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    },
    GoogleSignin: {
      configure: jest.fn(),
      hasPlayServices: jest.fn(async () => true),
      signInSilently: jest.fn(async () => ({user: {}})),
      signIn: jest.fn(async () => ({user: {}})),
      getTokens: jest.fn(async () => ({idToken: 'test-id-token', accessToken: 'test-access-token'})),
      signOut: jest.fn(async () => undefined),
      revokeAccess: jest.fn(async () => undefined),
      isSignedIn: jest.fn(async () => false),
      getCurrentUser: jest.fn(() => null),
    },
  };
});

jest.mock('@react-native-firebase/auth', () => {
  const signInWithCredential = jest.fn(async () => ({user: {}}));

  const authDefaultExport = () => ({
    signInWithCredential,
  });

  authDefaultExport.GoogleAuthProvider = {
    credential: jest.fn(() => ({providerId: 'google.com'})),
  };

  return {
    __esModule: true,
    default: authDefaultExport,
    GoogleAuthProvider: authDefaultExport.GoogleAuthProvider,
  };
});

jest.mock('@react-native-firebase/app', () => {
  return {
    getApp: jest.fn(() => ({})),
  };
});

jest.mock('@react-native-firebase/messaging', () => {
  const messagingInstance = {
    onNotificationOpenedApp: jest.fn(() => jest.fn()),
    onMessage: jest.fn(() => jest.fn()),
    onTokenRefresh: jest.fn(() => jest.fn()),
    requestPermission: jest.fn(async () => 1),
  };

  const getMessaging = jest.fn(() => messagingInstance);
  const defaultExport = () => messagingInstance;

  return {
    __esModule: true,
    default: defaultExport,
    getMessaging,
  };
});

jest.mock('@notifee/react-native', () => {
  return {
    requestPermission: jest.fn(async () => ({})),
  };
});
