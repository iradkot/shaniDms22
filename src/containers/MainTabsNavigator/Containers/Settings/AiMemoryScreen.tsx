import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {
  approveMemoryEntry,
  deleteMemoryEntry,
  getMemoryTree,
  isPendingMemorySuggestion,
  listMemoryEntries,
  MemoryEntry,
  updateMemoryEntry,
} from 'app/services/aiMemory/aiMemoryStore';
import {
  AiMemoryCategory,
  AI_MEMORY_CATEGORY_LABELS,
  memoryFolderKey,
  normalizeMemoryFolder,
} from 'app/services/aiMemory/memoryTaxonomy';
import {theme} from 'app/style/theme';
import {addOpacity} from 'app/style/styling.utils';

const ALL_CATEGORY = 'all';
type CategoryFilter = AiMemoryCategory | typeof ALL_CATEGORY;
type FolderTreeItem = {key: string; count: number};

const CATEGORY_ICONS: Record<AiMemoryCategory, string> = {
  current_status: 'bolt',
  clinical_history: 'medical-services',
  preferences: 'tune',
  daily_patterns: 'insights',
  nightscout_strategy: 'cloud-sync',
  assistant_feedback: 'rate-review',
};

const CATEGORY_LABELS_HE: Record<AiMemoryCategory, string> = {
  current_status: 'מצב עדכני',
  clinical_history: 'היסטוריה קלינית',
  preferences: 'העדפות אישיות',
  daily_patterns: 'דפוסים יומיים',
  nightscout_strategy: 'אסטרטגיית Nightscout',
  assistant_feedback: 'פידבק על הסוכן',
};

const FOLDER_LABELS_HE: Record<string, string> = {
  'current_status/active_context': 'הקשר פעיל עכשיו',
  'current_status/recent_recommendations': 'המלצות אחרונות',
  'current_status/pregnancy': 'הריון פעיל',
  'current_status/general': 'כללי',
  'clinical_history/pregnancy_history': 'היסטוריית הריון',
  'clinical_history/loop_settings_history': 'היסטוריית הגדרות Loop',
  'preferences/communication_style': 'סגנון תקשורת',
  'preferences/recommendation_style': 'סגנון המלצות',
  'daily_patterns/meals': 'ארוחות ותגובות',
  'daily_patterns/meals/plans': 'תכניות לארוחות',
  'daily_patterns/meals/photos': 'תמונות ארוחה',
  'daily_patterns/sleep': 'שינה',
  'daily_patterns/exercise': 'פעילות גופנית',
  'nightscout_strategy/data_fetching': 'שליפת נתונים',
  'nightscout_strategy/known_data_gaps': 'פערי נתונים ידועים',
  'assistant_feedback/helpful': 'מה עזר',
  'assistant_feedback/not_helpful': 'מה לא עזר',
};

const FOLDER_LABELS_EN: Record<string, string> = {
  'current_status/active_context': 'Active context',
  'current_status/recent_recommendations': 'Recent recommendations',
  'current_status/pregnancy': 'Active pregnancy',
  'current_status/general': 'General',
  'clinical_history/pregnancy_history': 'Pregnancy history',
  'clinical_history/loop_settings_history': 'Loop settings history',
  'preferences/communication_style': 'Communication style',
  'preferences/recommendation_style': 'Recommendation style',
  'daily_patterns/meals': 'Meals and responses',
  'daily_patterns/meals/plans': 'Meal plans',
  'daily_patterns/meals/photos': 'Meal photos',
  'daily_patterns/sleep': 'Sleep',
  'daily_patterns/exercise': 'Exercise',
  'nightscout_strategy/data_fetching': 'Data fetching',
  'nightscout_strategy/known_data_gaps': 'Known data gaps',
  'assistant_feedback/helpful': 'Helpful feedback',
  'assistant_feedback/not_helpful': 'Not helpful feedback',
};

function isDisabledForAi(entry: MemoryEntry) {
  return (entry.tags ?? []).includes('disabled_for_ai');
}

function formatDate(ms: number | null | undefined) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString();
}

function folderLabel(key: string, he: boolean) {
  return (he ? FOLDER_LABELS_HE : FOLDER_LABELS_EN)[key] ?? key.split('/').slice(1).join(' / ') ?? key;
}

function categoryLabel(category: AiMemoryCategory, he: boolean) {
  return he ? CATEGORY_LABELS_HE[category] : AI_MEMORY_CATEGORY_LABELS[category];
}

function cleanSummary(text: string) {
  return String(text ?? '')
    .replace(/\bcurrent_(status|subcategory)\b/gi, '')
    .replace(/\bcurrent_status\/general\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function entryTitle(entry: MemoryEntry, he: boolean) {
  const tags = new Set(entry.tags ?? []);
  const facts = entry.facts ?? {};
  if (isPendingMemorySuggestion(entry)) return he ? 'הצעת זיכרון לאישור' : 'Memory suggestion';
  if (tags.has('home_recommendation') || facts.recommendationKind) {
    return he ? 'המלצה אחרונה מהסוכן' : 'Recent AI recommendation';
  }
  if (tags.has('photo_input')) {
    return he ? 'תמונת ארוחה לניתוח' : 'Meal photo context';
  }
  if (tags.has('meal') || facts.mealId || facts.carbsG != null) {
    return he ? 'תגובה לארוחה' : 'Meal response';
  }
  if (tags.has('daily_review') || tags.has('plan_tomorrow')) {
    return he ? 'תובנת סיכום יומי' : 'Daily review insight';
  }
  if (tags.has('assistant_feedback')) {
    return he ? 'פידבק על תשובת הסוכן' : 'AI feedback';
  }
  return he ? 'זיכרון שמור' : 'Saved memory';
}

function entryPreview(entry: MemoryEntry) {
  const summary = cleanSummary(entry.textSummary);
  const firstLine = summary.split('\n').map(line => line.trim()).find(Boolean) ?? summary;
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

const AiMemoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {language} = useAppLanguage();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [tree, setTree] = useState<FolderTreeItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>(ALL_CATEGORY);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});

  const he = language === 'he';
  const pendingCount = useMemo(
    () => entries.filter(entry => isPendingMemorySuggestion(entry)).length,
    [entries],
  );

  const categoryOptions = useMemo(
    () =>
      [
        {id: ALL_CATEGORY, label: he ? 'הכל' : 'All'},
        ...Object.entries(AI_MEMORY_CATEGORY_LABELS).map(([id, label]) => ({
          id: id as AiMemoryCategory,
          label: categoryLabel(id as AiMemoryCategory, he) ?? label,
        })),
      ] as Array<{id: CategoryFilter; label: string}>,
    [he],
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [nextEntries, nextTree] = await Promise.all([
        listMemoryEntries({
          category: selectedCategory === ALL_CATEGORY ? undefined : selectedCategory,
          limit: 300,
        }),
        getMemoryTree(),
      ]);
      setEntries(nextEntries);
      setTree(nextTree);
      setDrafts(prev => {
        const next = {...prev};
        for (const entry of nextEntries) {
          if (next[entry.id] == null) next[entry.id] = entry.textSummary;
        }
        return next;
      });
    } finally {
      setBusy(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    load();
  }, [load]);

  const saveEntry = async (entry: MemoryEntry) => {
    const textSummary = (drafts[entry.id] ?? '').trim();
    if (!textSummary) return;

    setSavingId(entry.id);
    try {
      const updated = await updateMemoryEntry(entry.id, {textSummary});
      if (updated) {
        setEntries(prev => prev.map(item => (item.id === entry.id ? updated : item)));
        setEditingIds(prev => ({...prev, [entry.id]: false}));
      }
    } finally {
      setSavingId(null);
    }
  };

  const toggleUseInAi = async (entry: MemoryEntry) => {
    const disabled = isDisabledForAi(entry);
    const tags = disabled
      ? (entry.tags ?? []).filter(tag => tag !== 'disabled_for_ai')
      : [...new Set([...(entry.tags ?? []), 'disabled_for_ai'])];

    const updated = await updateMemoryEntry(entry.id, {tags});
    if (updated) {
      setEntries(prev => prev.map(item => (item.id === entry.id ? updated : item)));
    }
  };

  const approveEntry = async (entry: MemoryEntry) => {
    setSavingId(entry.id);
    try {
      const textSummary = (drafts[entry.id] ?? entry.textSummary).trim();
      if (textSummary && textSummary !== entry.textSummary) {
        await updateMemoryEntry(entry.id, {textSummary});
      }
      const updated = await approveMemoryEntry(entry.id);
      if (updated) {
        setEntries(prev => prev.map(item => (item.id === entry.id ? updated : item)));
        setDrafts(prev => ({...prev, [entry.id]: updated.textSummary}));
      }
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = (entry: MemoryEntry) => {
    Alert.alert(
      he ? 'למחוק זיכרון?' : 'Delete memory?',
      he
        ? 'הזיכרון יוסר מהמכשיר ולא ישמש יותר להמלצות.'
        : 'This removes the memory from the device and future recommendations.',
      [
        {text: he ? 'ביטול' : 'Cancel', style: 'cancel'},
        {
          text: he ? 'מחק' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteMemoryEntry(entry.id);
            if (ok) setEntries(prev => prev.filter(item => item.id !== entry.id));
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{flex: 1, backgroundColor: theme.backgroundColor}}
      contentContainerStyle={{
        padding: theme.spacing.lg,
        paddingBottom: theme.spacing.xl,
      }}
    >
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md}}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          style={{paddingRight: theme.spacing.md, paddingVertical: theme.spacing.sm}}
        >
          <MaterialIcons
            name={he ? 'chevron-right' : 'chevron-left'}
            size={28}
            color={theme.textColor}
          />
        </Pressable>
        <View style={{flex: 1}}>
          <Text style={{color: theme.textColor, fontSize: theme.typography.size.xl, fontWeight: '800'}}>
            {he ? 'מה הסוכן זוכר עליי' : 'What the AI remembers'}
          </Text>
          <Text style={{color: addOpacity(theme.textColor, 0.7), marginTop: 4}}>
            {he
              ? 'צפה, ערוך, מחק או החרג מידע מהמלצות עתידיות.'
              : 'Review, edit, delete, or exclude memory from future recommendations.'}
          </Text>
          {pendingCount > 0 ? (
            <Text style={{color: theme.accentColor, marginTop: 6, fontWeight: '700'}}>
              {he
                ? `${pendingCount} הצעות ממתינות לאישור`
                : `${pendingCount} pending suggestion${pendingCount === 1 ? '' : 's'}`}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: theme.spacing.md}}>
        {categoryOptions.map(option => {
          const selected = selectedCategory === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setSelectedCategory(option.id)}
              style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                marginRight: theme.spacing.sm,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? theme.accentColor : theme.borderColor,
                backgroundColor: selected ? addOpacity(theme.accentColor, 0.12) : theme.white,
              }}
            >
              <Text style={{color: theme.textColor, fontWeight: selected ? '800' : '600'}}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={{
          borderRadius: theme.borderRadius,
          backgroundColor: theme.white,
          borderWidth: 1,
          borderColor: theme.borderColor,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.md,
        }}
      >
        <Text style={{color: theme.textColor, fontWeight: '800', marginBottom: theme.spacing.xs}}>
          {he ? 'תיקיות פעילות' : 'Active folders'}
        </Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
          {tree.filter(item => item.count > 0).length ? (
            tree
              .filter(item => item.count > 0)
              .map(item => {
                const category = item.key.split('/')[0] as AiMemoryCategory;
                return (
                  <View
                    key={item.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: addOpacity(theme.accentColor, 0.08),
                      marginRight: theme.spacing.xs,
                      marginTop: theme.spacing.xs,
                    }}
                  >
                    <MaterialIcons
                      name={CATEGORY_ICONS[category] ?? 'folder'}
                      size={14}
                      color={theme.accentColor}
                    />
                    <Text
                      style={{
                        color: theme.textColor,
                        fontSize: theme.typography.size.xs,
                        marginLeft: 5,
                        fontWeight: '700',
                      }}
                    >
                      {folderLabel(item.key, he)} ({item.count})
                    </Text>
                  </View>
                );
              })
          ) : (
            <Text style={{color: addOpacity(theme.textColor, 0.7)}}>
              {he ? 'אין עדיין זיכרונות שמורים.' : 'No saved memories yet.'}
            </Text>
          )}
        </View>
      </View>

      {busy ? <ActivityIndicator style={{marginVertical: theme.spacing.lg}} /> : null}

      {!busy && !entries.length ? (
        <View
          style={{
            borderRadius: theme.borderRadius,
            backgroundColor: theme.white,
            padding: theme.spacing.lg,
            borderWidth: 1,
            borderColor: theme.borderColor,
          }}
        >
          <Text style={{color: theme.textColor, fontWeight: '700'}}>
            {he ? 'אין זיכרונות בקטגוריה הזו' : 'No memories in this category'}
          </Text>
        </View>
      ) : null}

      {entries.map(entry => {
        const folder = normalizeMemoryFolder(entry.folder);
        const folderKey = memoryFolderKey(folder);
        const editing = Boolean(editingIds[entry.id]);
        const disabled = isDisabledForAi(entry);
        const pending = isPendingMemorySuggestion(entry);
        return (
          <View
            key={entry.id}
            style={{
              borderRadius: theme.borderRadius,
              backgroundColor: theme.white,
              borderWidth: 1,
              borderColor: pending
                ? theme.accentColor
                : disabled
                  ? addOpacity(theme.belowRangeColor, 0.35)
                  : theme.borderColor,
              padding: theme.spacing.md,
              marginBottom: theme.spacing.md,
            }}
          >
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: addOpacity(theme.accentColor, 0.1),
                  marginRight: theme.spacing.sm,
                }}
              >
                <MaterialIcons
                  name={CATEGORY_ICONS[folder.category] ?? 'folder'}
                  size={19}
                  color={theme.accentColor}
                />
              </View>
              <View style={{flex: 1}}>
                <Text style={{color: theme.textColor, fontWeight: '800'}}>
                  {entryTitle(entry, he)}
                </Text>
                <Text style={{color: addOpacity(theme.textColor, 0.65), fontSize: theme.typography.size.xs}}>
                  {folderLabel(folderKey, he)} · {formatDate(entry.updatedAt)}
                  {pending ? (he ? ' · ממתין לאישור' : ' · pending approval') : ''}
                  {!pending && disabled ? (he ? ' · לא בשימוש AI' : ' · excluded from AI') : ''}
                </Text>
              </View>
              <Pressable onPress={() => confirmDelete(entry)} accessibilityRole="button">
                <MaterialIcons name="delete-outline" size={22} color={theme.belowRangeColor} />
              </Pressable>
            </View>

            {pending ? (
              <View
                style={{
                  marginTop: theme.spacing.md,
                  borderRadius: theme.borderRadius,
                  backgroundColor: addOpacity(theme.accentColor, 0.1),
                  padding: theme.spacing.sm,
                }}
              >
                <Text style={{color: theme.textColor, fontWeight: '700'}}>
                  {he
                    ? 'הסוכן מציע לשמור את זה. זה לא ישמש להמלצות עד שתאשר.'
                    : 'The AI suggested saving this. It will not be used for recommendations until approved.'}
                </Text>
              </View>
            ) : null}

            {editing ? (
              <TextInput
                multiline
                value={drafts[entry.id] ?? cleanSummary(entry.textSummary)}
                onChangeText={text => setDrafts(prev => ({...prev, [entry.id]: text}))}
                style={{
                  marginTop: theme.spacing.md,
                  minHeight: 110,
                  textAlignVertical: 'top',
                  borderWidth: 1,
                  borderColor: theme.borderColor,
                  borderRadius: theme.borderRadius,
                  padding: theme.spacing.md,
                  color: theme.textColor,
                  backgroundColor: theme.backgroundColor,
                }}
              />
            ) : (
              <View
                style={{
                  marginTop: theme.spacing.md,
                  borderRadius: theme.borderRadius,
                  backgroundColor: theme.backgroundColor,
                  padding: theme.spacing.md,
                }}
              >
                <Text style={{color: theme.textColor, lineHeight: 20}}>
                  {entryPreview(entry)}
                </Text>
              </View>
            )}

            <View
              style={{
                marginTop: theme.spacing.md,
                flexDirection: 'row',
                flexWrap: 'wrap',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: 999,
                  backgroundColor: addOpacity(theme.textColor, 0.06),
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: 5,
                  marginRight: theme.spacing.xs,
                  marginBottom: theme.spacing.xs,
                }}
              >
                <MaterialIcons name="label-outline" size={14} color={addOpacity(theme.textColor, 0.65)} />
                <Text
                  style={{
                    color: addOpacity(theme.textColor, 0.72),
                    fontSize: theme.typography.size.xs,
                    marginLeft: 4,
                    fontWeight: '600',
                  }}
                >
                  {categoryLabel(folder.category, he)}
                </Text>
              </View>
              {entry.source ? (
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor: addOpacity(theme.textColor, 0.06),
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: 5,
                    marginRight: theme.spacing.xs,
                    marginBottom: theme.spacing.xs,
                  }}
                >
                  <Text
                    style={{
                      color: addOpacity(theme.textColor, 0.72),
                      fontSize: theme.typography.size.xs,
                      fontWeight: '600',
                    }}
                  >
                    {entry.source === 'ai'
                      ? he
                        ? 'נוצר על ידי AI'
                        : 'AI generated'
                      : entry.source === 'sensor'
                        ? he
                          ? 'מנתוני חיישן'
                          : 'Sensor data'
                        : he
                          ? 'מהמשתמש'
                          : 'User saved'}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={{flexDirection: 'row', marginTop: theme.spacing.md}}>
              <Pressable
                onPress={() => {
                  if (!editing) {
                    setEditingIds(prev => ({...prev, [entry.id]: true}));
                    setDrafts(prev => ({...prev, [entry.id]: cleanSummary(entry.textSummary)}));
                    return;
                  }
                  saveEntry(entry);
                }}
                disabled={savingId === entry.id}
                style={{
                  flex: 1,
                  borderRadius: theme.borderRadius,
                  paddingVertical: theme.spacing.sm,
                  alignItems: 'center',
                  backgroundColor: editing ? theme.accentColor : addOpacity(theme.accentColor, 0.12),
                  marginRight: theme.spacing.sm,
                }}
              >
                <Text style={{color: editing ? theme.white : theme.textColor, fontWeight: '800'}}>
                  {savingId === entry.id
                    ? he
                      ? 'שומר...'
                      : 'Saving...'
                    : editing
                      ? he
                        ? 'שמור'
                        : 'Save'
                      : he
                        ? 'ערוך'
                        : 'Edit'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => (pending ? approveEntry(entry) : toggleUseInAi(entry))}
                disabled={savingId === entry.id}
                style={{
                  flex: 1,
                  borderRadius: theme.borderRadius,
                  paddingVertical: theme.spacing.sm,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: pending || disabled ? theme.accentColor : theme.borderColor,
                  backgroundColor: theme.white,
                }}
              >
                <Text style={{color: theme.textColor, fontWeight: '700'}}>
                  {pending
                    ? he
                      ? 'אשר זיכרון'
                      : 'Approve memory'
                    : disabled
                    ? he
                      ? 'החזר לשימוש'
                      : 'Use again'
                    : he
                      ? 'אל תשתמש בזה'
                      : 'Exclude from AI'}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
};

export default AiMemoryScreen;
