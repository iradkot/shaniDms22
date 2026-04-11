import {useAppTheme} from 'app/hooks/useAppTheme';
/**
 * TagInput — text input with autocomplete suggestions for adding meal tags.
 *
 * Shows a row of suggestion chips below the input. When the user types, the
 * suggestions are filtered. Pressing a suggestion or hitting enter adds the tag.
 *
 * Exposes a `flushPendingTag()` imperative handle so the parent can commit
 * any half-typed text when the user presses "Save" without hitting "+".
 */
import React, {useCallback, useImperativeHandle, useMemo, useState, forwardRef} from 'react';
import {TextInput, ScrollView} from 'react-native';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import type {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {normalizeTag} from 'app/services/mealTagService';

export interface TagInputHandle {
  /** Commit the current text as a tag (if valid). Returns the tag or null. */
  flushPendingTag: () => string | null;
}

interface TagInputProps {
  /** All known tag suggestions. */
  suggestions: string[];
  /** Tags that are already applied (used to hide from suggestions). */
  currentTags: string[];
  /** Called when the user adds a new tag. */
  onAddTag: (tag: string) => void;
}

const TagInput = forwardRef<TagInputHandle, TagInputProps>(({suggestions, currentTags, onAddTag}, ref) => {
  const theme = useAppTheme();
  const [text, setText] = useState('');

  // Expose flush so the parent can commit pending text on Save
  useImperativeHandle(ref, () => ({
    flushPendingTag: () => {
      const tag = normalizeTag(text);
      if (tag && !currentTags.includes(tag)) {
        onAddTag(tag);
        setText('');
        return tag;
      }
      if (tag && currentTags.includes(tag)) {
        setText('');
      }
      return null;
    },
  }), [text, currentTags, onAddTag]);

  const filteredSuggestions = useMemo(() => {
    const query = normalizeTag(text);
    const current = new Set(currentTags);
    return suggestions
      .filter(s => !current.has(s))
      .filter(s => !query || s.includes(query))
      .slice(0, 12);
  }, [suggestions, currentTags, text]);

  const handleSubmit = useCallback(() => {
    const tag = normalizeTag(text);
    if (tag && !currentTags.includes(tag)) {
      onAddTag(tag);
    }
    setText('');
  }, [text, currentTags, onAddTag]);

  const handleSuggestionPress = useCallback(
    (tag: string) => {
      if (!currentTags.includes(tag)) {
        onAddTag(tag);
      }
      setText('');
    },
    [currentTags, onAddTag],
  );

  return (
    <>
      <InputRow>
        <Icon name="tag-plus-outline" size={18} color={addOpacity(theme.textColor, 0.4)} />
        <StyledInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSubmit}
          placeholder="Type a tag (e.g. Pizza)"
          placeholderTextColor={addOpacity(theme.textColor, 0.3)}
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          blurOnSubmit={false}
        />
        {text.length > 0 ? (
          <AddBtn onPress={handleSubmit}>
            <Icon name="plus-circle" size={22} color={theme.accentColor} />
          </AddBtn>
        ) : null}
      </InputRow>

      {filteredSuggestions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{paddingHorizontal: 4, paddingVertical: 4}}>
          {filteredSuggestions.map(tag => (
            <SuggestionChip key={tag} onPress={() => handleSuggestionPress(tag)} style={{marginRight: 6}}>
              <SuggestionText>{tag}</SuggestionText>
            </SuggestionChip>
          ))}
        </ScrollView>
      ) : null}
    </>
  );
});

// ── Styled ──────────────────────────────────────────────────────────────

const InputRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.15)};
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  padding-vertical: 6px;
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
`;

const StyledInput = styled(TextInput)<{theme: ThemeType}>`
  flex: 1;
  font-size: 14px;
  color: ${(p: {theme: ThemeType}) => p.theme.textColor};
  margin-left: 6px;
  padding-vertical: 4px;
`;

const AddBtn = styled.TouchableOpacity`
  padding: 2px;
`;

const SuggestionChip = styled.TouchableOpacity<{theme: ThemeType}>`
  padding: 4px 10px;
  border-radius: 12px;
  background-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.08)};
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.accentColor, 0.15)};
`;

const SuggestionText = styled.Text<{theme: ThemeType}>`
  font-size: 12px;
  font-weight: 600;
  color: ${(p: {theme: ThemeType}) => p.theme.accentColor};
  text-transform: capitalize;
`;

export default React.memo(TagInput);
