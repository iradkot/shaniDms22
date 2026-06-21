import {useCallback, useMemo, useRef, useState} from 'react';
import type {GestureResponderEvent} from 'react-native';

import type {StackedChartsTouchSession} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';

export function useHomeChartTouchSession() {
  const [isChartTouchSessionActive, setIsChartTouchSessionActive] =
    useState(false);
  const chartTouchSessionRef = useRef<StackedChartsTouchSession | null>(
    null,
  );

  const clearChartTouchSession = useCallback(() => {
    chartTouchSessionRef.current = null;
    setIsChartTouchSessionActive(false);
  }, []);

  const handleChartTouchSessionChange = useCallback(
    (session: StackedChartsTouchSession | null) => {
      chartTouchSessionRef.current = session;
      setIsChartTouchSessionActive(session != null);
    },
    [],
  );

  const handleScrollTouchMove = useCallback((event: GestureResponderEvent) => {
    chartTouchSessionRef.current?.handlePageTouchMove(event);
  }, []);

  const handleScrollTouchEnd = useCallback(() => {
    chartTouchSessionRef.current?.handlePageTouchEnd();
    clearChartTouchSession();
  }, [clearChartTouchSession]);

  const handleScrollTouchCancel = useCallback(() => {
    chartTouchSessionRef.current?.handlePageTouchCancel();
    clearChartTouchSession();
  }, [clearChartTouchSession]);

  const scrollTouchHandlers = useMemo(
    () => ({
      onTouchMove: handleScrollTouchMove,
      onTouchEnd: handleScrollTouchEnd,
      onTouchCancel: handleScrollTouchCancel,
    }),
    [handleScrollTouchCancel, handleScrollTouchEnd, handleScrollTouchMove],
  );

  return {
    isChartTouchSessionActive,
    handleChartTouchSessionChange,
    scrollTouchHandlers,
  };
}
