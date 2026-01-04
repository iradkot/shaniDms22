import React, {FC, useCallback, useMemo} from 'react';
import {FlatList, View} from 'react-native';
import BgDataCard from 'app/components/CgmCardListDisplay/BgDataCard';
import {BgSample} from 'app/types/day_bgs.types';
import {getLoadReferences, LOAD_BARS_CONSTANTS} from 'app/utils/loadBars.utils';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import FullScreenButton from 'app/components/common-ui/FullScreenButton/FullScreenButton';
import {useNavigation} from '@react-navigation/native';
import {FULL_SCREEN_VIEW_SCREEN} from 'app/constants/SCREEN_NAMES';
import {StackActions} from '@react-navigation/native';

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
  showFullScreenButton = true,
}) => {
  const navigation = useNavigation();

  const openFullScreen = useCallback(() => {
    const params = {
      mode: 'cgmRows' as const,
      bgData,
      isLoading,
      isToday,
    };

    const action = StackActions.push(FULL_SCREEN_VIEW_SCREEN, params);
    const parent = (navigation as any)?.getParent?.();
    if (parent?.dispatch) {
      parent.dispatch(action);
      return;
    }
    if ((navigation as any)?.dispatch) {
      (navigation as any).dispatch(action);
      return;
    }
    (navigation as any).navigate?.(FULL_SCREEN_VIEW_SCREEN, params);
  }, [bgData, isLoading, isToday, navigation]);

  const {maxIobReference, maxCobReference} = useMemo(
    () => getLoadReferences(bgData),
    [bgData],
  );

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
      />
    ),
    [bgData, maxIobReference, maxCobReference],
  );

  return (
    <View style={{flex: 1}}>
      {showFullScreenButton ? (
        <View style={{alignItems: 'flex-end', paddingRight: 8, paddingTop: 8}}>
          <FullScreenButton
            testID={E2E_TEST_IDS.glucoseLog.fullScreenButton}
            onPress={openFullScreen}
          />
        </View>
      ) : null}

      <FlatList
        testID={E2E_TEST_IDS.glucoseLog.list}
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
