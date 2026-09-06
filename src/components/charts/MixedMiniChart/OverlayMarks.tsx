import React from 'react';
import {Circle, G, Line, Path, Rect} from 'react-native-svg';
import type {LoadPoint} from 'app/utils/chartLoadSeries.utils';
import type {buildMiniBasalSegments} from '../miniChartData';

type Coordinates = {
  x: (time: number) => number;
  y: (value: number) => number;
  color: string;
};

export function BasalOverlayMarks({
  segments,
  x,
  y,
  color,
}: Coordinates & {
  segments: ReturnType<typeof buildMiniBasalSegments>;
}) {
  return (
    <>
      {segments.map((segment, index) => {
        const previous = segments[index - 1];
        const scheduled = segment.source === 'scheduled';
        const dash = scheduled ? {strokeDasharray: '5 4'} : {};
        return (
          <G key={`${segment.startMs}-${segment.source}`}>
            <Rect
              x={x(segment.startMs)}
              y={y(segment.rate)}
              width={Math.max(0, x(segment.endMs) - x(segment.startMs))}
              height={Math.max(0, y(0) - y(segment.rate))}
              fill={color}
              opacity={scheduled ? 0.05 : 0.13}
            />
            <Line
              testID={`basal-${segment.source}-segment`}
              x1={x(segment.startMs)}
              x2={x(segment.endMs)}
              y1={y(segment.rate)}
              y2={y(segment.rate)}
              stroke={color}
              strokeWidth={2}
              {...dash}
            />
            {previous &&
            previous.endMs === segment.startMs &&
            previous.rate !== segment.rate ? (
              <Line
                x1={x(segment.startMs)}
                x2={x(segment.startMs)}
                y1={y(previous.rate)}
                y2={y(segment.rate)}
                stroke={color}
                strokeWidth={2}
                {...dash}
              />
            ) : null}
          </G>
        );
      })}
    </>
  );
}

/** Separate segments preserve missing samples and long gaps in both lines and fills. */
export function LoadOverlayMarks({
  kind,
  segments,
  x,
  y,
  color,
}: Coordinates & {
  kind: 'iob' | 'cob';
  segments: LoadPoint[][];
}) {
  return (
    <>
      {segments.map((segment, index) => {
        const first = segment[0];
        const last = segment[segment.length - 1];
        if (!first || !last) {
          return null;
        }
        if (segment.length === 1) {
          return (
            <Circle
              key={index}
              testID={`${kind}-single-point`}
              cx={x(first.x)}
              cy={y(first.y)}
              r={3}
              fill={color}
            />
          );
        }
        const path = segment
          .map(
            (point, pointIndex) =>
              `${pointIndex ? 'L' : 'M'}${x(point.x)} ${y(point.y)}`,
          )
          .join(' ');
        return (
          <G key={index}>
            <Path
              d={`${path} L${x(last.x)} ${y(0)} L${x(first.x)} ${y(0)} Z`}
              fill={color}
              opacity={kind === 'iob' ? 0.08 : 0.06}
            />
            <Path
              testID={`${kind}-line-segment`}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...(kind === 'cob' ? {strokeDasharray: '3 4'} : {})}
            />
          </G>
        );
      })}
    </>
  );
}
