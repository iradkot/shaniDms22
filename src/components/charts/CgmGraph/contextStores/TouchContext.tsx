import React, {createContext, useContext, ReactNode} from 'react';
import type {GestureResponderEvent} from 'react-native';
import useTouchHandler, {TouchHandlerState, TouchPosition} from '../hooks/useTouchHandler';

export type TouchContextType = TouchHandlerState;

const NOOP = () => {};

// Providing an initial default value
const defaultContextValue: TouchContextType = {
  isTouchActive: false,
  touchPosition: {x: 0, y: 0} satisfies TouchPosition,
  handleTouchStart: (_event: GestureResponderEvent) => NOOP(),
  handleTouchMove: (_event: GestureResponderEvent) => NOOP(),
  handleTouchEnd: () => NOOP(),
};

// Create the context with the default value
const TouchContext = createContext<TouchContextType>(defaultContextValue);

// Type the props for TouchProvider for TypeScript
interface TouchProviderProps {
  children: ReactNode;
}

export const TouchProvider: React.FC<TouchProviderProps> = ({children}) => {
  const touchHandler = useTouchHandler();

  return (
    <TouchContext.Provider value={touchHandler}>
      {children}
    </TouchContext.Provider>
  );
};

// Custom hook to use the touch context
export const useTouchContext = (): TouchContextType => useContext(TouchContext);
