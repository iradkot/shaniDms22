import React from 'react';

/**
 * Browser builds can discover native-only package specs while optimizing
 * dependencies. Keep those imports inert instead of resolving React Native's
 * private codegen module, which has no react-native-web equivalent.
 */
const codegenNativeComponent = <TProps extends object>(
  _nativeName: string,
): React.ComponentType<TProps> => {
  const UnsupportedNativeComponent = (_props: TProps) => null;
  UnsupportedNativeComponent.displayName = 'UnsupportedNativeComponent';
  return UnsupportedNativeComponent;
};

export default codegenNativeComponent;
