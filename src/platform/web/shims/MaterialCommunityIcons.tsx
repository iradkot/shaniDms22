import React from 'react';
import {Text} from 'react-native';
import type {ColorValue, TextProps} from 'react-native';
import glyphMapSource from 'react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json?raw';

const glyphMap = JSON.parse(glyphMapSource) as Readonly<Record<string, number>>;

export interface WebMaterialCommunityIconProps extends TextProps {
  readonly name: string;
  readonly size?: number;
  readonly color?: ColorValue;
}

/** Browser-only renderer that shares the native Material Community icon font. */
const MaterialCommunityIcons = ({
  name,
  size = 12,
  color = '#000000',
  style,
  ...props
}: WebMaterialCommunityIconProps) => {
  const codePoint = glyphMap[name];
  const glyph = codePoint === undefined ? '?' : String.fromCodePoint(codePoint);
  return (
    <Text
      {...props}
      selectable={false}
      style={[
        // Browser font metrics are dynamic because the native API accepts size.
        // eslint-disable-next-line react-native/no-inline-styles
        {color, fontFamily: 'MaterialCommunityIcons', fontSize: size},
        style,
      ]}>
      {glyph}
    </Text>
  );
};

export default MaterialCommunityIcons;
