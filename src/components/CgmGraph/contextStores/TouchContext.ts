import React from 'react';
import {GestureResponderEvent} from 'react-native';

interface TouchContextProps {
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onTouchIn: (event: GestureResponderEvent) => void;
  onTouchOut: (event: GestureResponderEvent) => void;
}

const TouchContext = React.createContext<TouchContextProps>({
  isFocused: false,
  onFocus: () => {},
  onBlur: () => {},
  onTouchIn: () => {},
  onTouchOut: () => {},
});

const TouchProvider = ({children}: {children: React.ReactNode}) => {
  const [isFocused, setIsFocused] = React.useState(false);

  const onFocus = () => {
    setIsFocused(true);
  };

  const onBlur = () => {
    setIsFocused(false);
  };

  const onTouchIn = () => {
    setIsFocused(true);
  };

  const onTouchOut = () => {
    setIsFocused(false);
  };

  return (
    <TouchContext.Provider
      value={{
        isFocused,
        onFocus,
        onBlur,
        onTouchIn,
        onTouchOut,
      }}>
      {children}
    </TouchContext.Provider>
  );
};
