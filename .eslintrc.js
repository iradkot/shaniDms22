module.exports = {
  root: true,
  extends: [
    "@react-native",
    "plugin:prettier/recommended"
  ],
  plugins: ["prettier"],
  rules: {
    "prettier/prettier": "error",
    "react-native/no-inline-styles": 0,
    "react-hooks/exhaustive-deps": 0,
    "react-hooks/rules-of-hooks": 0,
    "no-unused-vars": 0,
    "no-shadow": 0,
    "no-undef": 0,
    "no-use-before-define": 0,
    "no-console": 0,
    "no-underscore-dangle": 0,
    "no-param-reassign": 0,
    "import/no-unresolved": 0,
    "react/prop-types": 0,
    "react/jsx-props-no-spreading": 0
  }
};
