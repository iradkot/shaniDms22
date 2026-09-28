import React from 'react';
import {StyleSheet, View} from 'react-native';

export const INSULIN_COLORS = {basal: '#68DFC7', bolus: '#BEA7FF'} as const;
export interface InsulinGraphicAmounts {
  readonly basalUnits: number;
  readonly bolusUnits: number;
  readonly totalUnits?: number;
}
export const insulinGraphicTotal = (insulin: InsulinGraphicAmounts): number =>
  insulin.basalUnits + insulin.bolusUnits;

/** Only call for a complete recorded split, or for an explicitly labeled comparison component. */
export const InsulinSplitGraphic = ({
  insulin,
  maximum = insulinGraphicTotal(insulin),
  miniature = false,
  rtl = false,
}: {
  readonly insulin: InsulinGraphicAmounts;
  readonly maximum?: number;
  readonly miniature?: boolean;
  readonly rtl?: boolean;
}) => {
  const safeMaximum = Number.isFinite(maximum) && maximum > 0 ? maximum : 0;
  const basal = safeMaximum ? Math.max(0, insulin.basalUnits) / safeMaximum : 0;
  const bolus = safeMaximum ? Math.max(0, insulin.bolusUnits) / safeMaximum : 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="daily-overview-insulin-split-graphic"
      style={[
        styles.track,
        rtl && styles.reverse,
        miniature && styles.miniTrack,
      ]}>
      {basal > 0 ? (
        <View
          style={[
            styles.fill,
            {flex: basal, backgroundColor: INSULIN_COLORS.basal},
          ]}
        />
      ) : null}
      {bolus > 0 ? (
        <View
          style={[
            styles.fill,
            {flex: bolus, backgroundColor: INSULIN_COLORS.bolus},
          ]}
        />
      ) : null}
      <View style={{flex: Math.max(0, 1 - basal - bolus)}} />
    </View>
  );
};
const styles = StyleSheet.create({
  track: {
    height: 12,
    borderRadius: 7,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#34445B',
  },
  fill: {height: '100%'},
  reverse: {flexDirection: 'row-reverse'},
  miniTrack: {width: 48, height: 10},
});
