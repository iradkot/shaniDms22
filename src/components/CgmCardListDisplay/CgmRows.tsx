import React, {FC, useCallback, useEffect, useMemo, useRef} from 'react';
import {FlatList, View} from 'react-native';
import BgDataCard from 'app/components/CgmCardListDisplay/BgDataCard';
import {BgSample} from 'app/types/day_bgs.types';
import {getLoadReferences, LOAD_BARS_CONSTANTS} from 'app/utils/loadBars.utils';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import FullScreenButton from 'app/components/common-ui/FullScreenButton/FullScreenButton';
import {useNavigation} from '@react-navigation/native';
import {FULL_SCREEN_VIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {StackActions} from '@react-navigation/native';
import styled from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {dispatchToParentOrSelf} from 'app/utils/navigationDispatch.utils';

const FullScreenButtonContainer = styled.View.attrs({collapsable: false})`
  position: absolute;
  top: 0px;
  right: 0px;
  width: 100%;
  z-index: 1;
  align-items: flex-end;
  padding-top: ${(props: {theme: ThemeType}) => props.theme.spacing.sm}px;
  padding-right: ${(props: {theme: ThemeType}) => props.theme.spacing.sm}px;
`;

const CGM_ROWS_CONSTANTS = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 10,
  updateCellsBatchingPeriodMs: 50,
  windowSize: 21,
  contentContainerFlexGrow: 1,
} as const;

interface CgmCardListDisplayProps {
  bgData: BgSample[];
  onPullToRefreshRefresh?: () => void;
  isLoading: boolean;
  isToday: boolean;

  /**
   * When provided, the list will scroll to the closest matching BG sample date.
   * Use `focusToken` to retrigger scrolling/highlighting for the same target.
   */
  focusTargetDateMs?: number | null;

  /**
   * One or more BG sample timestamps to highlight (glow).
   */
  focusHighlightDateMs?: number[];

  /**
   * Monotonic token that retriggers focus behaviors.
   */
  focusToken?: number;

  /**
   * Whether to show the fullscreen button.
   * Defaults to true.
   */
  showFullScreenButton?: boolean;
}

const CgmRows: FC<CgmCardListDisplayProps> = ({
  bgData,
  onPullToRefreshRefresh,
  isLoading,
  isToday,
  focusTargetDateMs,
  focusHighlightDateMs,
  focusToken,
  showFullScreenButton = true,
}) => {
  const navigation = useNavigation();
  const listRef = useRef<FlatList<BgSample> | null>(null);

  const openFullScreen = useCallback(() => {
    const params = {
      mode: 'cgmRows' as const,
      bgData,
      isLoading,
      isToday,
    };

    const action = StackActions.push(FULL_SCREEN_VIEW_SCREEN, params);
    dispatchToParentOrSelf({
      navigation,
      action,
      fallbackNavigate: () => (navigation as any).navigate?.(FULL_SCREEN_VIEW_SCREEN, params),
    });
  }, [bgData, isLoading, isToday, navigation]);

  const {maxIobReference, maxCobReference} = useMemo(
    () => getLoadReferences(bgData),
    [bgData],
  );

  const highlightSet = useMemo(() => {
    const dates = focusHighlightDateMs ?? [];
    if (!dates.length) return null;
    return new Set(dates);
    // Intentionally key off focusToken so a repeat tap retriggers highlight.
  }, [focusToken, focusHighlightDateMs]);

  useEffect(() => {
    if (!focusToken) return;
    if (!focusTargetDateMs) return;
    if (!bgData.length) return;

    let bestIndex = 0;
    let bestDiff = Number.POSITIVE_INFINITY;

    for (let i = 0; i < bgData.length; i++) {
      const diff = Math.abs(bgData[i].date - focusTargetDateMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
      if (diff === 0) break;
    }

    try {
      // Defer until FlatList is ready to avoid occasional scrollToIndex failures.
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index: bestIndex,
          animated: true,
          viewPosition: 0.15,
        });
      });
    } catch {
      // Best-effort: if scrollToIndex fails, we just skip.
    }
  }, [bgData, focusTargetDateMs, focusToken]);

  const bgDataKeyExtractor = useCallback((item: BgSample) => {
    return item.date.toString();
  }, []);

  const renderItem = useCallback(
    ({item, index}: {item: BgSample; index: number}) => (
      <BgDataCard
        bgData={item}
        prevBgData={bgData[index + 1]}
        maxIobReference={maxIobReference}
        maxCobReference={maxCobReference}
        highlight={!!highlightSet?.has(item.date)}
        highlightToken={focusToken}
      />
    ),
    [bgData, focusToken, highlightSet, maxIobReference, maxCobReference],
  );

  return (
    <View style={{flex: 1}}>
      {showFullScreenButton ? (
        <FullScreenButtonContainer>
          <FullScreenButton
            testID={E2E_TEST_IDS.glucoseLog.fullScreenButton}
            onPress={openFullScreen}
          />
        </FullScreenButtonContainer>
      ) : null}

      <FlatList
        testID={E2E_TEST_IDS.glucoseLog.list}
        ref={ref => {
          listRef.current = ref;
        }}
        keyExtractor={bgDataKeyExtractor}
        data={bgData}
        renderItem={renderItem}
        refreshing={isLoading}
        onRefresh={onPullToRefreshRefresh}
        initialNumToRender={CGM_ROWS_CONSTANTS.initialNumToRender}
        maxToRenderPerBatch={CGM_ROWS_CONSTANTS.maxToRenderPerBatch}
        updateCellsBatchingPeriod={CGM_ROWS_CONSTANTS.updateCellsBatchingPeriodMs}
        windowSize={CGM_ROWS_CONSTANTS.windowSize}
        removeClippedSubviews={true}
        getItemLayout={(_, index) => ({
          length: LOAD_BARS_CONSTANTS.rowHeight,
          offset: LOAD_BARS_CONSTANTS.rowHeight * index,
          index,
        })}
        // inverted // Invert the FlatList to start from the bottom
        contentContainerStyle={{flexGrow: CGM_ROWS_CONSTANTS.contentContainerFlexGrow}} // Make sure the list grows from the bottom
      />
    </View>
  );
};

export default CgmRows;
