import React, {createContext, useContext, ReactNode} from 'react';
import {GestureResponderEvent} from 'react-native'; // Import GestureResponderEvent
import useTouchHandler from '../hooks/useTouchHandler';

// Define a type for your context state adjusted for React Native
interface TouchContextType {
  isTouchActive: boolean;
  touchPosition: {x: number; y: number};
  handleTouchStart: (event: GestureResponderEvent) => void;
  handleTouchMove: (event: GestureResponderEvent) => void;
  handleTouchEnd: () => void;
}

// Providing an initial default value
const defaultContextValue: TouchContextType = {
  isTouchActive: false,
  touchPosition: {x: 0, y: 0},
  handleTouchStart: () => {
    console.log('defaultContextValueCB');
  },
  handleTouchMove: () => {
    console.log('defaultContextValueCB');
  },
  handleTouchEnd: () => {
    console.log('defaultContextValueCB');
  },
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
