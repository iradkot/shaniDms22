// Jest setup for React Native native-module shims used by unit tests.

require('react-native-gesture-handler/jestSetup');

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
global.__reanimatedWorkletInit = () => {};

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');
jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  const {View} = require('react-native');
  return ({children, ...props}) => React.createElement(View, props, children);
});
jest.mock('react-native-drop-shadow', () => {
  const React = require('react');
  return ({children}) => React.createElement(React.Fragment, null, children);
});

jest.mock('d3', () => {
  const toNumber = v => (v instanceof Date ? v.getTime() : Number(v));

  const makeScale = () => {
    let domain = [0, 1];
    let range = [0, 1];
    const scale = x => {
      const xv = toNumber(x);
      const d0 = toNumber(domain[0]);
      const d1 = toNumber(domain[1]);
      const r0 = range[0];
      const r1 = range[1];
      if (!Number.isFinite(xv) || !Number.isFinite(d0) || !Number.isFinite(d1)) return r0;
      if (d1 === d0) return r0;
      const t = (xv - d0) / (d1 - d0);
      return r0 + t * (r1 - r0);
    };

    scale.invert = x => {
      const xv = toNumber(x);
      const d0 = toNumber(domain[0]);
      const d1 = toNumber(domain[1]);
      const r0 = range[0];
      const r1 = range[1];
      if (!Number.isFinite(xv) || !Number.isFinite(d0) || !Number.isFinite(d1)) return new Date(d0);
      if (r1 === r0) return new Date(d0);
      const t = (xv - r0) / (r1 - r0);
      const dv = d0 + t * (d1 - d0);
      return new Date(dv);
    };
    scale.domain = function (next) {
      if (arguments.length === 0) return domain;
      if (Array.isArray(next)) domain = next;
      return scale;
    };
    scale.range = function (next) {
      if (arguments.length === 0) return range;
      if (Array.isArray(next)) range = next;
      return scale;
    };
    return scale;
  };

  const extent = (arr, accessor) => {
    if (!Array.isArray(arr) || arr.length === 0) return [undefined, undefined];
    let min = undefined;
    let max = undefined;
    for (const item of arr) {
      const v = accessor ? accessor(item) : item;
      const n = toNumber(v);
      if (!Number.isFinite(n)) continue;
      if (min == null || n < min) min = n;
      if (max == null || n > max) max = n;
    }
    return [min != null ? new Date(min) : undefined, max != null ? new Date(max) : undefined];
  };

  const line = () => {
    let xAccessor = d => d[0];
    let yAccessor = d => d[1];
    const gen = points => {
      if (!Array.isArray(points) || points.length === 0) return null;
      // Minimal SVG path string; enough for rendering without crashing.
      const p0 = points[0];
      return `M${toNumber(xAccessor(p0))} ${toNumber(yAccessor(p0))}`;
    };
    gen.x = fn => {
      xAccessor = fn;
      return gen;
    };
    gen.y = fn => {
      yAccessor = fn;
      return gen;
    };
    gen.curve = () => gen;
    return gen;
  };

  return {
    interpolateRgb: () => () => '#000000',
    extent,
    scaleTime: makeScale,
    scaleLinear: makeScale,
    line,
    curveMonotoneX: {},
  };
});

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
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      setOptions: jest.fn(),
      reset: jest.fn(),
      canGoBack: jest.fn(() => false),
    }),
    useRoute: () => ({params: {}}),
    StackActions: {
      push: jest.fn(() => ({type: 'PUSH'})),
    },
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
