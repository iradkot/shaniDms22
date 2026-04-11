/**
 * TagMealSheet — modal overlay for tagging a meal.
 *
 * Shows current tags as removable chips, a TagInput for adding new tags,
 * and a Save button. Saves locally + syncs to Nightscout on confirm.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Modal, KeyboardAvoidingView, Platform} from 'react-native';
import styled, {useTheme} from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import type {ThemeType} from 'app/types/theme';
import {theme as appTheme} from 'app/style/theme';
import type {MealTag} from 'app/types/mealTag.types';
import {addOpacity} from 'app/style/styling.utils';
import TagChip from 'app/components/MealTagging/TagChip';
import TagInput from 'app/components/MealTagging/TagInput';
import type {TagInputHandle} from 'app/components/MealTagging/TagInput';

interface TagMealSheetProps {
  visible: boolean;
  /** Meal label (e.g. "Lunch · 12:34") for the header. */
  mealLabel: string;
  /** Current tags on this meal. */
  currentTags: MealTag[];
  /** All known tag suggestions. */
  suggestions: string[];
  /** Called on Save with the final tag list. */
  onSave: (tags: MealTag[]) => void;
  /** Called when the sheet is dismissed without saving. */
  onClose: () => void;
}

const TagMealSheet: React.FC<TagMealSheetProps> = ({
  visible,
  mealLabel,
  currentTags,
  suggestions,
  onSave,
  onClose,
}) => {
  const styledTheme = useTheme() as ThemeType | undefined;
  const theme = styledTheme || appTheme;
  const [tags, setTags] = useState<MealTag[]>(currentTags);
  const tagInputRef = useRef<TagInputHandle>(null);

  // Reset local state when opened with new tags
  useEffect(() => {
    if (visible) {
      setTags(currentTags);
    }
  }, [visible, currentTags]);

  const handleAdd = useCallback((tag: MealTag) => {
    setTags(prev => (prev.includes(tag) ? prev : [...prev, tag]));
  }, []);

  const handleRemove = useCallback((tag: MealTag) => {
    setTags(prev => prev.filter(t => t !== tag));
  }, []);

  const handleSave = useCallback(() => {
    // Auto-commit any text the user typed but didn't press "+" for
    let finalTags = tags;
    const pending = tagInputRef.current?.flushPendingTag();
    if (pending && !finalTags.includes(pending)) {
      finalTags = [...finalTags, pending];
    }
    onSave(finalTags);
  }, [tags, onSave]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Backdrop onPress={onClose} activeOpacity={1}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{width: '100%'}}>
          <Sheet
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}>
            {/* Handle bar */}
            <HandleBar />

            {/* Header */}
            <HeaderRow>
              <Icon name="tag-heart-outline" size={20} color={theme.accentColor} />
              <HeaderTitle numberOfLines={1}>Tag Meal</HeaderTitle>
              <CloseBtn onPress={onClose}>
                <Icon name="close" size={22} color={addOpacity(theme.textColor, 0.5)} />
              </CloseBtn>
            </HeaderRow>

            <MealLabelText numberOfLines={1}>{mealLabel}</MealLabelText>

            {/* Current tags */}
            {tags.length > 0 ? (
              <TagsRow>
                {tags.map(tag => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    removable
                    onRemove={() => handleRemove(tag)}
                  />
                ))}
              </TagsRow>
            ) : (
              <EmptyText>No tags yet — add one below</EmptyText>
            )}

            {/* Input + suggestions */}
            <TagInput
              ref={tagInputRef}
              suggestions={suggestions}
              currentTags={tags}
              onAddTag={handleAdd}
            />

            {/* Save */}
            <SaveBtn onPress={handleSave}>
              <SaveText>Save Tags</SaveText>
            </SaveBtn>
          </Sheet>
        </KeyboardAvoidingView>
      </Backdrop>
    </Modal>
  );
};

// ── Styled ──────────────────────────────────────────────────────────────

const Backdrop = styled.TouchableOpacity<{theme: ThemeType}>`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const Sheet = styled.View<{theme: ThemeType}>`
  background-color: ${(p: {theme: ThemeType}) => p.theme.backgroundColor};
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding-bottom: 32px;
  min-height: 300px;
`;

const HandleBar = styled.View<{theme: ThemeType}>`
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.2)};
  align-self: center;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const HeaderTitle = styled.Text<{theme: ThemeType}>`
  flex: 1;
  font-size: 18px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
`;

const CloseBtn = styled.TouchableOpacity`
  padding: 4px;
`;

const MealLabelText = styled.Text<{theme: ThemeType}>`
  font-size: 13px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.5)};
  margin-top: 4px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const TagsRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const EmptyText = styled.Text<{theme: ThemeType}>`
  font-size: 13px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.35)};
  font-style: italic;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const SaveBtn = styled.TouchableOpacity<{theme: ThemeType}>`
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.lg}px;
  background-color: ${(p: {theme: ThemeType}) => p.theme.accentColor};
  padding: 14px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  align-items: center;
`;

const SaveText = styled.Text<{theme: ThemeType}>`
  font-size: 15px;
  font-weight: 700;
  color: ${(p: {theme: ThemeType}) => p.theme.buttonTextColor};
`;

export default React.memo(TagMealSheet);
