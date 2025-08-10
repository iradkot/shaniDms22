import {useState} from 'react';
import {GestureResponderEvent} from 'react-native';

const DEBOUNCE_DELAY = 300; // Adjust this value as needed

const useTouchHandler = () => {
  // Original touch state
  const [isTouchActive, setIsTouchActive] = useState(false);
  const [touchPosition, setTouchPosition] = useState({x: 0, y: 0});
  
  // Zoom gesture state
  const [isZoomGestureActive, setIsZoomGestureActive] = useState(false);
  const [zoomGestureState, setZoomGestureState] = useState({
    scale: 1.0,
    translateX: 0,
    translateY: 0,
  });

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
  
  // Zoom gesture handlers
  const handleZoomGestureStart = () => {
    setIsZoomGestureActive(true);
  };
  
  const handleZoomGestureUpdate = (scale: number, translateX: number, translateY: number) => {
    setZoomGestureState({
      scale,
      translateX,
      translateY,
    });
  };
  
  const handleZoomGestureEnd = () => {
    setIsZoomGestureActive(false);
  };

  return {
    // Original touch functionality
    isTouchActive,
    touchPosition,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    
    // Zoom gesture functionality
    isZoomGestureActive,
    zoomGestureState,
    handleZoomGestureStart,
    handleZoomGestureUpdate,
    handleZoomGestureEnd,
  };
};

export default useTouchHandler;
