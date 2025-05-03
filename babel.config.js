module.exports = {
  presets: ['@react-native/babel-preset'],      //  ⬅️  NEW
  plugins: [
    ['module-resolver', {alias: {app: './src'}}],  // path alias
    ['react-native-worklets-core/plugin'],
    'react-native-reanimated/plugin',
  ],
};
