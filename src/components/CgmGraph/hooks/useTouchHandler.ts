import {useState} from 'react';
import {GestureResponderEvent} from 'react-native';

const useTouchHandler = () => {
  const [isTouchActive, setIsTouchActive] = useState(false);
  const [touchPosition, setTouchPosition] = useState({x: 0, y: 0});

  const handleTouchStart = (event: GestureResponderEvent) => {
    const {locationX, locationY} = event.nativeEvent;
    setIsTouchActive(true);
    setTouchPosition({x: locationX, y: locationY});
  };

  const handleTouchMove = (event: GestureResponderEvent) => {
    const {locationX, locationY} = event.nativeEvent;
    setTouchPosition({x: locationX, y: locationY});
  };

  const handleTouchEnd = () => {
    setIsTouchActive(false);
  };

  return {
    isTouchActive,
    touchPosition,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};

export default useTouchHandler;
