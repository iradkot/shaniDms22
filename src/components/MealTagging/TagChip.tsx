/**
 * TagChip — small pill showing a single meal tag.
 *
 * Used in MealTimelineCard, MealRow, and TagMealSheet.
 * Optionally shows a remove button (×).
 */
import React from 'react';
import styled, {useTheme} from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import type {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

interface TagChipProps {
  tag: string;
  /** Show a remove "×" button. */
  removable?: boolean;
  onRemove?: () => void;
  /** Tap the chip itself (e.g. to filter by tag). */
  onPress?: () => void;
  /** Compact size (for inline display in cards). */
  compact?: boolean;
}

const TagChip: React.FC<TagChipProps> = ({
  tag,
  removable,
  onRemove,
  onPress,
  compact,
}) => {
  const theme = useTheme() as ThemeType;

  return (
    <Wrapper
      $compact={compact}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}>
      <Icon
        name="tag-outline"
        size={compact ? 10 : 12}
        color={theme.accentColor}
      />
      <TagText $compact={compact}>{tag}</TagText>
      {removable ? (
        <RemoveBtn onPress={onRemove} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Icon name="close-circle" size={compact ? 12 : 14} color={addOpacity(theme.textColor, 0.4)} />
        </RemoveBtn>
      ) : null}
    </Wrapper>
  );
};

// ── Styled ──────────────────────────────────────────────────────────────

const Wrapper = styled.TouchableOpacity<{$compact?: boolean; theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  padding-vertical: ${(p: {$compact?: boolean}) => (p.$compact ? 2 : 4)}px;
  padding-horizontal: ${(p: {$compact?: boolean}) => (p.$compact ? 6 : 8)}px;
  border-radius: 12px;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.1)};
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.2)};
`;

const TagText = styled.Text<{$compact?: boolean; theme: ThemeType}>`
  font-size: ${(p: {$compact?: boolean}) => (p.$compact ? 10 : 12)}px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => p.theme.accentColor};
  margin-left: 3px;
  text-transform: capitalize;
`;

const RemoveBtn = styled.TouchableOpacity`
  margin-left: 4px;
`;

export default React.memo(TagChip);
