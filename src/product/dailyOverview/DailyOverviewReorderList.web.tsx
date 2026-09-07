import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import {productUiTokens} from '../ui/tokens';
import {
  edgeScrollVelocity,
  REORDER_CARD_HEIGHT,
  REORDER_ROW_HEIGHT,
  REORDER_VIEWPORT_HEIGHT,
  reorderCopy,
  reorderIds,
  type DailyOverviewReorderListProps,
} from './dailyOverviewReorder';

export type {DailyOverviewReorderListProps} from './dailyOverviewReorder';

interface PointerDrag {
  id: string;
  pointerId: number;
  handle: HTMLButtonElement;
  initialIds: string[];
  nextIds: string[];
  startY: number;
  clientY: number;
  startScroll: number;
  startTop: number;
  top: number;
  previousFrame: number;
}

export function DailyOverviewReorderList({
  items,
  onReorder,
  locale,
  disabled = false,
}: DailyOverviewReorderListProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const pointer = useRef<PointerDrag | null>(null);
  const frame = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const reducedMotion = useRef(false);
  const copy = reorderCopy[locale];
  const ids = items.map(item => item.id);
  const signature = JSON.stringify(ids);
  const contentHeight = Math.max(0, items.length * REORDER_ROW_HEIGHT - 12);
  const height = Math.min(REORDER_VIEWPORT_HEIGHT, contentHeight);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reducedMotion.current = media.matches;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const paint = useCallback(
    (order: readonly string[], active: PointerDrag | null) => {
      order.forEach((id, index) => {
        const row = rows.current.get(id);
        if (!row) {
          return;
        }
        const isActive = active?.id === id;
        row.style.transition =
          reducedMotion.current || isActive ? 'none' : 'transform 160ms ease';
        row.style.transform = `translate3d(0, ${
          isActive ? active.top : index * REORDER_ROW_HEIGHT
        }px, 0)`;
        row.style.zIndex = isActive ? '10' : '1';
        row.style.borderColor = isActive
          ? productUiTokens.colors.action
          : productUiTokens.colors.border;
        row.style.boxShadow = isActive
          ? '0 5px 18px rgba(24, 53, 75, 0.16)'
          : 'none';
      });
    },
    [],
  );

  const stopFrame = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  const finish = useCallback(
    (commit: boolean) => {
      const active = pointer.current;
      if (!active) {
        return;
      }
      pointer.current = null;
      stopFrame();
      // Clear first: releasePointerCapture dispatches lostpointercapture.
      if (active.handle.hasPointerCapture(active.pointerId)) {
        active.handle.releasePointerCapture(active.pointerId);
      }
      const nextIds = commit ? active.nextIds : active.initialIds;
      paint(nextIds, null);
      setDraggingId(null);
      if (
        commit &&
        nextIds.some((id, index) => id !== active.initialIds[index])
      ) {
        onReorder(nextIds);
        const item = items.find(candidate => candidate.id === active.id);
        if (item) {
          setAnnouncement(
            copy.moved(
              item.label,
              nextIds.indexOf(active.id) + 1,
              nextIds.length,
            ),
          );
        }
      }
    },
    [copy, items, onReorder, paint, stopFrame],
  );
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const cancel = () => finishRef.current(false);
    const onVisibility = () => {
      if (document.hidden) {
        cancel();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pointer.current) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('keydown', onKey);
      stopFrame();
      const active = pointer.current;
      pointer.current = null;
      if (active?.handle.hasPointerCapture(active.pointerId)) {
        active.handle.releasePointerCapture(active.pointerId);
      }
    };
  }, [stopFrame]);

  useEffect(() => {
    if (pointer.current) {
      finishRef.current(false);
    }
    paint(JSON.parse(signature) as string[], null);
  }, [paint, signature]);

  useEffect(() => {
    if (disabled) {
      finishRef.current(false);
    }
  }, [disabled]);

  const animate = useCallback(
    function tick(time: number) {
      const active = pointer.current;
      const container = viewport.current;
      if (!active || !container) {
        frame.current = null;
        return;
      }
      const rect = container.getBoundingClientRect();
      const elapsed =
        active.previousFrame === 0
          ? 16
          : Math.min(32, time - active.previousFrame);
      active.previousFrame = time;
      const velocity = edgeScrollVelocity(
        active.clientY - rect.top,
        container.clientHeight,
      );
      const maxScroll = Math.max(
        0,
        container.scrollHeight - container.clientHeight,
      );
      container.scrollTop = Math.max(
        0,
        Math.min(maxScroll, container.scrollTop + (velocity * elapsed) / 1000),
      );
      active.top = Math.max(
        0,
        Math.min(
          (active.initialIds.length - 1) * REORDER_ROW_HEIGHT,
          active.startTop +
            active.clientY -
            active.startY +
            container.scrollTop -
            active.startScroll,
        ),
      );
      active.nextIds = reorderIds(
        active.initialIds,
        active.id,
        Math.round(active.top / REORDER_ROW_HEIGHT),
      );
      paint(active.nextIds, active);
      frame.current = requestAnimationFrame(tick);
    },
    [paint],
  );

  const begin = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (
      disabled ||
      pointer.current ||
      !event.isPrimary ||
      event.button !== 0 ||
      !viewport.current
    ) {
      return;
    }
    event.preventDefault();
    const handle = event.currentTarget;
    handle.focus({preventScroll: true});
    handle.setPointerCapture(event.pointerId);
    const top = ids.indexOf(id) * REORDER_ROW_HEIGHT;
    pointer.current = {
      id,
      pointerId: event.pointerId,
      handle,
      initialIds: [...ids],
      nextIds: [...ids],
      startY: event.clientY,
      clientY: event.clientY,
      startScroll: viewport.current.scrollTop,
      startTop: top,
      top,
      previousFrame: 0,
    };
    setDraggingId(id);
    paint(ids, pointer.current);
    frame.current = requestAnimationFrame(animate);
  };

  const move = (id: string, target: number) => {
    if (disabled || pointer.current) {
      return;
    }
    const next = reorderIds(ids, id, target);
    if (next.every((value, index) => value === ids[index])) {
      return;
    }
    onReorder(next);
    const item = items.find(candidate => candidate.id === id);
    if (item) {
      setAnnouncement(
        copy.moved(item.label, next.indexOf(id) + 1, next.length),
      );
    }
    const container = viewport.current;
    if (container) {
      container.scrollTop = Math.max(
        0,
        target * REORDER_ROW_HEIGHT - height / 2 + REORDER_CARD_HEIGHT / 2,
      );
    }
  };

  return (
    <div>
      <div
        ref={viewport}
        data-testid="daily-overview-reorder-list"
        role="list"
        aria-label={copy.list}
        style={{
          height,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: draggingId ? 'contain' : 'auto',
          borderRadius: 16,
          position: 'relative',
        }}>
        <div style={{height: contentHeight, position: 'relative'}}>
          {items.map((item, index) => (
            <div
              key={item.id}
              ref={node => {
                if (node) {
                  rows.current.set(item.id, node);
                } else {
                  rows.current.delete(item.id);
                }
              }}
              data-testid={`daily-overview-reorder-${item.id}`}
              role="listitem"
              aria-label={copy.moved(item.label, index + 1, items.length)}
              style={{
                ...cardStyle,
                flexDirection: locale === 'he' ? 'row-reverse' : 'row',
                transform: `translate3d(0, ${index * REORDER_ROW_HEIGHT}px, 0)`,
              }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 10,
                  maxHeight: REORDER_CARD_HEIGHT - 2,
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: productUiTokens.colors.textMuted,
                    marginBottom: 5,
                    textAlign: locale === 'he' ? 'right' : 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                  {item.label}
                </div>
                {item.preview}
              </div>
              <div
                style={{
                  width: 44,
                  flexShrink: 0,
                  margin: '0 3px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}>
                <button
                  type="button"
                  data-testid={`daily-overview-move-up-${item.id}`}
                  aria-label={`${copy.up}: ${item.label}`}
                  disabled={disabled || draggingId !== null || index === 0}
                  style={{
                    ...arrowStyle,
                    opacity: disabled || index === 0 ? 0.3 : 1,
                  }}
                  onClick={() => move(item.id, index - 1)}>
                  ↑
                </button>
                <button
                  type="button"
                  data-testid={`daily-overview-drag-${item.id}`}
                  aria-label={`${copy.drag}: ${item.label}`}
                  aria-describedby={`daily-overview-drag-help-${item.id}`}
                  disabled={disabled}
                  onPointerDown={event => begin(event, item.id)}
                  onPointerMove={event => {
                    if (pointer.current?.pointerId === event.pointerId) {
                      pointer.current.clientY = event.clientY;
                    }
                  }}
                  onPointerUp={event => {
                    if (pointer.current?.pointerId === event.pointerId) {
                      // The final pointer event can arrive before the next frame.
                      const active = pointer.current;
                      active.top = Math.max(
                        0,
                        Math.min(
                          (active.initialIds.length - 1) * REORDER_ROW_HEIGHT,
                          active.startTop +
                            event.clientY -
                            active.startY +
                            (viewport.current?.scrollTop ??
                              active.startScroll) -
                            active.startScroll,
                        ),
                      );
                      active.nextIds = reorderIds(
                        active.initialIds,
                        active.id,
                        Math.round(active.top / REORDER_ROW_HEIGHT),
                      );
                      finish(true);
                    }
                  }}
                  onPointerCancel={event => {
                    if (pointer.current?.pointerId === event.pointerId) {
                      finish(false);
                    }
                  }}
                  onLostPointerCapture={event => {
                    if (pointer.current?.pointerId === event.pointerId) {
                      finish(false);
                    }
                  }}
                  onKeyDown={event => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault();
                      move(
                        item.id,
                        index + (event.key === 'ArrowDown' ? 1 : -1),
                      );
                    }
                  }}
                  style={{
                    ...handleStyle,
                    cursor: draggingId === item.id ? 'grabbing' : 'grab',
                    opacity: disabled ? 0.3 : 1,
                  }}>
                  ⠿
                </button>
                <span
                  id={`daily-overview-drag-help-${item.id}`}
                  style={hiddenStyle}>
                  {copy.hint}
                </span>
                <button
                  type="button"
                  data-testid={`daily-overview-move-down-${item.id}`}
                  aria-label={`${copy.down}: ${item.label}`}
                  disabled={
                    disabled ||
                    draggingId !== null ||
                    index === items.length - 1
                  }
                  style={{
                    ...arrowStyle,
                    opacity: disabled || index === items.length - 1 ? 0.3 : 1,
                  }}
                  onClick={() => move(item.id, index + 1)}>
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <span role="status" aria-live="polite" style={hiddenStyle}>
        {announcement}
      </span>
    </div>
  );
}

const cardStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: REORDER_CARD_HEIGHT,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  border: `1px solid ${productUiTokens.colors.border}`,
  borderRadius: 16,
  background: productUiTokens.colors.surface,
};
const arrowStyle: CSSProperties = {
  width: 44,
  height: 32,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: productUiTokens.colors.action,
  fontSize: 19,
  cursor: 'pointer',
};
const handleStyle: CSSProperties = {
  width: 44,
  height: 44,
  padding: 0,
  border: 0,
  borderRadius: 12,
  background: productUiTokens.colors.surfaceInfo,
  color: productUiTokens.colors.action,
  fontSize: 30,
  lineHeight: '34px',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};
const hiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export default DailyOverviewReorderList;
