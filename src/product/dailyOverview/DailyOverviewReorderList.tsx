import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  type NativeGesture,
} from 'react-native-gesture-handler';
import Animated, {
  measure,
  ReduceMotion,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import {ChartScrollContext} from '../../components/charts/interaction/ChartScrollContext';
import {productUiTokens} from '../ui/tokens';
import {
  edgeScrollVelocity,
  makePositions,
  movePosition,
  REORDER_CARD_HEIGHT,
  REORDER_ROW_HEIGHT,
  REORDER_VIEWPORT_HEIGHT,
  reorderCopy,
  reorderIds,
  type DailyOverviewReorderItem,
  type DailyOverviewReorderListProps,
} from './dailyOverviewReorder';

export type {DailyOverviewReorderListProps} from './dailyOverviewReorder';

interface DragState {
  activeId: string | null;
  positions: Record<string, number>;
  initialPositions: Record<string, number>;
  top: number;
  startTop: number;
  startFingerY: number;
  fingerY: number;
  startScroll: number;
  viewportTop: number;
  viewportHeight: number;
}

function updateDrag(
  state: DragState,
  offset: number,
  count: number,
): DragState {
  'worklet';
  if (state.activeId === null) {
    return state;
  }
  const top = Math.max(
    0,
    Math.min(
      (count - 1) * REORDER_ROW_HEIGHT,
      state.startTop +
        state.fingerY -
        state.startFingerY +
        offset -
        state.startScroll,
    ),
  );
  return {
    ...state,
    top,
    positions: movePosition(
      state.positions,
      state.activeId,
      Math.round(top / REORDER_ROW_HEIGHT),
    ),
  };
}

interface RowProps {
  item: DailyOverviewReorderItem;
  index: number;
  count: number;
  locale: 'en' | 'he';
  disabled: boolean;
  drag: SharedValue<DragState>;
  offset: SharedValue<number>;
  scrollRef: AnimatedRef<ScrollView>;
  scrollGesture: NativeGesture;
  parentScrollGesture: NativeGesture | null;
  onDragging: (dragging: boolean) => void;
  onDrop: (positions: Record<string, number>) => void;
  onMove: (id: string, target: number) => void;
}

function ReorderRow({
  item,
  index,
  count,
  locale,
  disabled,
  drag,
  offset,
  scrollRef,
  scrollGesture,
  parentScrollGesture,
  onDragging,
  onDrop,
  onMove,
}: RowProps) {
  const copy = reorderCopy[locale];
  const id = item.id;
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .withTestId(`daily-overview-pan-${id}`)
      .enabled(!disabled)
      .minDistance(1)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .blocksExternalGesture(scrollGesture)
      .onStart(event => {
        const viewport = measure(scrollRef);
        if (!viewport || drag.value.activeId !== null) {
          return;
        }
        scrollTo(scrollRef, 0, offset.value, false);
        const top = (drag.value.positions[id] ?? index) * REORDER_ROW_HEIGHT;
        drag.value = {
          activeId: id,
          positions: drag.value.positions,
          initialPositions: {...drag.value.positions},
          top,
          startTop: top,
          startFingerY: event.absoluteY,
          fingerY: event.absoluteY,
          startScroll: offset.value,
          viewportTop: viewport.pageY,
          viewportHeight: viewport.height,
        };
        runOnJS(onDragging)(true);
      })
      .onUpdate(event => {
        if (drag.value.activeId !== id) {
          return;
        }
        drag.value = updateDrag(
          {...drag.value, fingerY: event.absoluteY},
          offset.value,
          count,
        );
      })
      .onEnd((_event, success) => {
        if (!success || drag.value.activeId !== id) {
          return;
        }
        const positions = drag.value.positions;
        drag.value = {...drag.value, activeId: null};
        runOnJS(onDrop)(positions);
      })
      .onFinalize(() => {
        // An interrupted gesture never publishes its provisional order.
        if (drag.value.activeId === id) {
          drag.value = {
            ...drag.value,
            activeId: null,
            positions: drag.value.initialPositions,
          };
        }
        runOnJS(onDragging)(false);
      });
    if (parentScrollGesture) {
      pan.blocksExternalGesture(parentScrollGesture);
    }
    return pan;
  }, [
    count,
    disabled,
    drag,
    id,
    index,
    offset,
    onDragging,
    onDrop,
    parentScrollGesture,
    scrollGesture,
    scrollRef,
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    const active = drag.value.activeId === id;
    const top = (drag.value.positions[id] ?? index) * REORDER_ROW_HEIGHT;
    return {
      transform: [
        {
          translateY: active
            ? drag.value.top
            : withTiming(top, {
                duration: 160,
                reduceMotion: ReduceMotion.System,
              }),
        },
      ],
      zIndex: active ? 10 : 1,
      borderColor: active
        ? productUiTokens.colors.action
        : productUiTokens.colors.border,
      elevation: active ? 7 : 0,
      shadowOpacity: active ? 0.14 : 0,
    };
  });

  return (
    <Animated.View
      testID={`daily-overview-reorder-${id}`}
      style={[styles.card, locale === 'he' && styles.rtlRow, animatedStyle]}>
      <View style={styles.preview} pointerEvents="none">
        <Text
          numberOfLines={1}
          style={[styles.label, locale === 'he' && styles.rtlText]}>
          {item.label}
        </Text>
        {item.preview}
      </View>
      <View style={styles.controls}>
        <Pressable
          testID={`daily-overview-move-up-${id}`}
          accessibilityRole="button"
          accessibilityLabel={`${copy.up}: ${item.label}`}
          accessibilityState={{disabled: disabled || index === 0}}
          disabled={disabled || index === 0}
          onPress={() => onMove(id, index - 1)}
          style={[styles.arrow, (disabled || index === 0) && styles.disabled]}>
          <Text style={styles.arrowText}>↑</Text>
        </Pressable>
        <GestureDetector gesture={gesture}>
          <Animated.View
            testID={`daily-overview-drag-${id}`}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${copy.drag}: ${item.label}`}
            accessibilityHint={copy.hint}
            accessibilityValue={{min: 1, max: count, now: index + 1}}
            accessibilityState={{disabled}}
            accessibilityActions={[
              {name: 'increment', label: copy.down},
              {name: 'decrement', label: copy.up},
            ]}
            onAccessibilityAction={event => {
              if (!disabled) {
                onMove(
                  id,
                  index +
                    (event.nativeEvent.actionName === 'increment' ? 1 : -1),
                );
              }
            }}
            style={[styles.handle, disabled && styles.disabled]}>
            <Text style={styles.grip}>⠿</Text>
          </Animated.View>
        </GestureDetector>
        <Pressable
          testID={`daily-overview-move-down-${id}`}
          accessibilityRole="button"
          accessibilityLabel={`${copy.down}: ${item.label}`}
          accessibilityState={{disabled: disabled || index === count - 1}}
          disabled={disabled || index === count - 1}
          onPress={() => onMove(id, index + 1)}
          style={[
            styles.arrow,
            (disabled || index === count - 1) && styles.disabled,
          ]}>
          <Text style={styles.arrowText}>↓</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function DailyOverviewReorderList({
  items,
  onReorder,
  locale,
  disabled = false,
}: DailyOverviewReorderListProps) {
  const ids = useMemo(() => items.map(item => item.id), [items]);
  const signature = JSON.stringify(ids);
  const parentScrollGesture = useContext(ChartScrollContext);
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const scrollRef = useAnimatedRef<ScrollView>();
  // Reanimated 3's AnimatedRef predates React 19's nullable callback refs.
  const attachScrollRef = useCallback(
    (node: ScrollView | null) => {
      if (node) {
        scrollRef(node);
      } else {
        scrollRef.current = null;
      }
    },
    [scrollRef],
  );
  const offset = useSharedValue(0);
  const [dragging, setDragging] = useState(false);
  const count = items.length;
  const contentHeight = Math.max(0, count * REORDER_ROW_HEIGHT - 12);
  const height = Math.min(REORDER_VIEWPORT_HEIGHT, contentHeight);
  const drag = useSharedValue<DragState>({
    activeId: null,
    positions: makePositions(ids),
    initialPositions: {},
    top: 0,
    startTop: 0,
    startFingerY: 0,
    fingerY: 0,
    startScroll: 0,
    viewportTop: 0,
    viewportHeight: height,
  });

  useEffect(() => {
    const positions = makePositions(JSON.parse(signature) as string[]);
    drag.value = {...drag.value, activeId: null, positions};
    setDragging(false);
  }, [drag, signature]);

  useEffect(() => {
    if (disabled && drag.value.activeId !== null) {
      drag.value = {
        ...drag.value,
        activeId: null,
        positions: drag.value.initialPositions,
      };
      setDragging(false);
    }
  }, [disabled, drag]);

  const onScroll = useAnimatedScrollHandler(event => {
    offset.value = event.contentOffset.y;
  });
  useFrameCallback(frame => {
    const state = drag.value;
    if (state.activeId === null) {
      return;
    }
    const velocity = edgeScrollVelocity(
      state.fingerY - state.viewportTop,
      state.viewportHeight,
    );
    const nextOffset = Math.max(
      0,
      Math.min(
        Math.max(0, contentHeight - state.viewportHeight),
        offset.value +
          (velocity * Math.min(frame.timeSincePreviousFrame ?? 16, 32)) / 1000,
      ),
    );
    if (nextOffset !== offset.value) {
      offset.value = nextOffset;
      scrollTo(scrollRef, 0, nextOffset, false);
      drag.value = updateDrag(state, nextOffset, count);
    }
  });

  const onDrop = useCallback(
    (positions: Record<string, number>) => {
      const next = [...ids].sort(
        (a, b) => (positions[a] ?? 0) - (positions[b] ?? 0),
      );
      if (next.some((id, index) => id !== ids[index])) {
        onReorder(next);
      }
    },
    [ids, onReorder],
  );

  const onMove = useCallback(
    (id: string, target: number) => {
      if (disabled || dragging) {
        return;
      }
      const next = reorderIds(ids, id, target);
      if (next.every((value, index) => value === ids[index])) {
        return;
      }
      onReorder(next);
      const item = items.find(candidate => candidate.id === id);
      if (item) {
        AccessibilityInfo.announceForAccessibility(
          reorderCopy[locale].moved(
            item.label,
            next.indexOf(id) + 1,
            ids.length,
          ),
        );
      }
      scrollRef.current?.scrollTo({
        y: Math.max(
          0,
          target * REORDER_ROW_HEIGHT - height / 2 + REORDER_CARD_HEIGHT / 2,
        ),
        animated: false,
      });
    },
    [disabled, dragging, height, ids, items, locale, onReorder, scrollRef],
  );

  return (
    <GestureDetector gesture={scrollGesture}>
      <Animated.ScrollView
        ref={attachScrollRef}
        testID="daily-overview-reorder-list"
        accessibilityLabel={reorderCopy[locale].list}
        style={[styles.viewport, {height}]}
        contentContainerStyle={{height: contentHeight}}
        nestedScrollEnabled
        bounces={false}
        overScrollMode="never"
        scrollEnabled={!dragging}
        scrollEventThrottle={16}
        onScroll={onScroll}>
        {items.map((item, index) => (
          <ReorderRow
            key={item.id}
            item={item}
            index={index}
            count={items.length}
            locale={locale}
            disabled={disabled}
            drag={drag}
            offset={offset}
            scrollRef={scrollRef}
            scrollGesture={scrollGesture}
            parentScrollGesture={parentScrollGesture}
            onDragging={setDragging}
            onDrop={onDrop}
            onMove={onMove}
          />
        ))}
      </Animated.ScrollView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: {flexGrow: 0, borderRadius: 16},
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: REORDER_CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: productUiTokens.colors.surface,
    shadowColor: '#18354B',
    shadowOffset: {width: 0, height: 3},
    shadowRadius: 8,
  },
  rtlRow: {flexDirection: 'row-reverse'},
  preview: {
    flex: 1,
    minWidth: 0,
    padding: 10,
    overflow: 'hidden',
    maxHeight: REORDER_CARD_HEIGHT - 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: productUiTokens.colors.textMuted,
    marginBottom: 5,
  },
  rtlText: {textAlign: 'right', writingDirection: 'rtl'},
  controls: {width: 44, alignItems: 'center', marginHorizontal: 3},
  arrow: {
    width: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {color: productUiTokens.colors.action, fontSize: 19},
  handle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: productUiTokens.colors.surfaceInfo,
  },
  grip: {color: productUiTokens.colors.action, fontSize: 30, lineHeight: 34},
  disabled: {opacity: 0.3},
});

export default DailyOverviewReorderList;
