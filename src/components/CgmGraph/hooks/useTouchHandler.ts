import { useState } from "react";

const useTouchHandler = () => {
  const [isTouchActive, setIsTouchActive] = useState(false);
  const [touchPosition, setTouchPosition] = useState({ x: 0, y: 0 });

  const handleTouchStart = (event: {
    nativeEvent: { locationX: any; locationY: any };
  }) => {
    const { locationX, locationY } = event.nativeEvent;
    setIsTouchActive(true);
    setTouchPosition({ x: locationX, y: locationY });
  };

  const handleTouchMove = (event: {
    nativeEvent: { locationX: any; locationY: any };
  }) => {
    const { locationX, locationY } = event.nativeEvent;
    setTouchPosition({ x: locationX, y: locationY });
  };

  const handleTouchEnd = () => {
    setIsTouchActive(false);
  };

  return {
    isTouchActive,
    touchPosition,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
};

export default useTouchHandler;
